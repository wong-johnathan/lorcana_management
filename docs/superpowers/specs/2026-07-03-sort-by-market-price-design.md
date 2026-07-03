# Sort by market price

## Purpose

The card database grid has no sort control today — cards always render in a fixed `setCode, name` order. The user wants to be able to sort the grid by market price, to quickly find the most/least valuable cards in the catalog (or within a filtered subset, e.g. a specific set or color).

## The variant-price ambiguity

A card can have more than one `CardPrice` row — `variant` is one of `Normal`, `Cold Foil`, `Holofoil` — and 2,430 of the 2,927 currently-priced cards have more than one variant row, each with a potentially very different `marketPrice` (foils are often priced much higher than the base card). "Sort by market price" is therefore ambiguous unless a specific price is chosen per card.

The grid tile already defines this today for display purposes (`client/src/components/CardGrid.tsx:37-38`):

```ts
const marketPrice = card.prices?.find((p) => p.variant === "Normal")?.marketPrice
  ?? card.prices?.[0]?.marketPrice;
```

This feature reuses that exact rule for sorting, so the sort order always matches the price shown on the tile — no surprises.

## Why this needs new storage, not just a query tweak

Prisma cannot sort a `Card.findMany` by an arbitrary field on a to-many relation (`Card.prices: CardPrice[]`) — only `_count` ordering is supported for to-many relations, not ordering by a value within them. Achieving "sort by market price" with the existing schema would require raw SQL, which means reimplementing today's dynamic `where`-clause filter logic (search, color, set, rarity, type, character, cardType, ownership, analyzed — `server/src/routes/cards.ts:63-100`) in raw SQL, or juggling a fragile two-step raw-then-Prisma hybrid.

Instead, denormalize: store the card's "display price" (the same Normal-else-first value from the rule above) directly on the `Card` row, kept in sync whenever prices are synced. This mirrors the precedent already set by `tcgPlayerId`/`cardTraderUrl`/`cardmarketUrl`, all of which live directly on `Card` rather than being joined/computed at read time. Sorting then becomes a plain, native Prisma `orderBy` on a scalar field — trivial to compose with the existing filters and pagination, no raw SQL anywhere.

## Design

### Schema

Add to `server/prisma/schema.prisma`'s `Card` model:

```prisma
displayPrice Float?
```

with an index (`@@index([displayPrice])`) since it will be used for ordering. Nullable, additive migration — same shape as the CardTrader/CardMarket work (`server/prisma/migrations/20260703180000_add_marketplace_links`).

### Keeping `displayPrice` in sync

In `server/src/services/priceSync.ts`'s `syncGroupPrices`, after the existing loop upserts all variant `CardPrice` rows for a given `card` (inside the `for (const card of matchingCards)` block, after the inner `for (const vp of variantPrices)` upsert loop completes for that card), recompute and persist the card's display price:

```ts
const allPrices = await prisma.cardPrice.findMany({ where: { cardId: card.id } });
const displayPrice = allPrices.find((p) => p.variant === "Normal")?.marketPrice
  ?? allPrices[0]?.marketPrice
  ?? null;
await prisma.card.update({ where: { id: card.id }, data: { displayPrice } });
```

This is the identical Normal-else-first rule from `CardGrid.tsx`, applied at write time instead of render time. One extra query+update per matched card per sync run — negligible against the sync's existing network-bound loop (300ms delay per group already).

Cards that have never been price-synced simply keep `displayPrice: null` (the column's default), which the sort's null-handling (below) accounts for.

### API

`GET /api/cards` (`server/src/routes/cards.ts:47`) gets a new optional query param: `sort`, with recognized values `price_asc` and `price_desc`. Any other value (including absent) preserves today's default ordering.

```ts
const sortOrderBy =
  sort === "price_asc"
    ? [{ displayPrice: { sort: "asc" as const, nulls: "last" as const } }, { setCode: "asc" as const }, { name: "asc" as const }]
    : sort === "price_desc"
    ? [{ displayPrice: { sort: "desc" as const, nulls: "last" as const } }, { setCode: "asc" as const }, { name: "asc" as const }]
    : [{ setCode: "asc" as const }, { name: "asc" as const }];
```

passed as `orderBy: sortOrderBy` in the existing `prisma.card.findMany` call (`server/src/routes/cards.ts:111-117`), replacing the hardcoded `orderBy` array. Prisma's `nulls: "last"` modifier (supported for nullable scalar fields since Prisma 4.16+; this repo runs 6.19) guarantees cards with no price data sort to the end regardless of direction — so "Low to High" doesn't misleadingly surface unpriced cards first. The `setCode`/`name` secondary keys keep ties (including all the null-priced cards bucketed together) in the existing deterministic order.

This param composes for free with every existing filter (`where` clause is untouched) and with pagination (`skip`/`take` unaffected) since it's purely an `orderBy` change.

### Frontend

`client/src/components/FilterBar.tsx` gets one more plain `<select>`, styled identically to the existing "Card Type" and "AI Analysis" single-select dropdowns (`client/src/components/FilterBar.tsx:275-296`):

```tsx
<select
  value={filters.sort || ""}
  onChange={(e) => update("sort", e.target.value)}
  className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
>
  <option value="">Sort: Default</option>
  <option value="price_asc">Price: Low to High</option>
  <option value="price_desc">Price: High to Low</option>
</select>
```

Since `FilterBar`'s `update(key, value)` helper (`client/src/components/FilterBar.tsx:47-55`) is already generic over any filter key, no changes are needed there beyond adding this select. In `client/src/pages/DatabasePage.tsx`, add `"sort"` to the tracked-keys array in `filtersFromParams` (`client/src/pages/DatabasePage.tsx:12`) so the sort choice is read from and written to the URL like every other filter — `loadCards` (`client/src/pages/DatabasePage.tsx:74-96`) already spreads `filters` generically into the request params, and `handleFilterChange`/`syncToUrl` already reset to page 1 and sync any filter key to the URL, so no other client-side wiring is needed.

## Out of scope

- No per-variant sort option (e.g. "sort by foil price specifically") — out of scope per the price-definition decision above.
- No UI indicator distinguishing "this card's price came from a fallback variant" — the existing tile display doesn't distinguish this either, so sorting stays consistent with it.
- No changes to `CardDetail.tsx`/`CardDetailPage.tsx` — this is a database-grid-only feature.
- No backfill script beyond the existing price sync — running "Sync Prices" (already an existing, already-scheduled flow) populates `displayPrice` for the whole catalog in one pass. Until the next sync runs post-deploy, `displayPrice` is null for all cards (all cards sort to the end / tie on the secondary keys) — self-heals on the next sync, exactly like the CardTrader/CardMarket rollout.

## Verification

1. Run the new Prisma migration; confirm `Card.displayPrice` exists, is nullable, and is indexed.
2. Trigger "Sync Prices"; confirm via `psql` that `displayPrice` is populated to match each card's Normal-else-first `marketPrice` (spot-check a multi-variant card against its `CardPrice` rows).
3. `GET /api/cards?sort=price_asc` returns cards in ascending `displayPrice` order with all null-priced cards at the end; `GET /api/cards?sort=price_desc` returns descending order, also with nulls at the end (not the start).
4. Confirm sorting composes correctly with an existing filter, e.g. `GET /api/cards?color=Amber&sort=price_desc` only returns Amber cards, ordered by price.
5. In the browser, select each sort option in the database page's FilterBar; confirm the grid re-orders correctly, the URL reflects `?sort=price_asc`/`price_desc`, infinite scroll continues to paginate correctly through the sorted order, and reloading the page with a `sort` param in the URL preserves the selection.
