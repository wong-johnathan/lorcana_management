# CardTrader and CardMarket link buttons

## Purpose

The card detail views (quick-view modal and full detail page) show a TCGPlayer button, but that's the only third-party marketplace linked. The user wants matching CardTrader and CardMarket buttons, and — since not every card has a link on every marketplace — a consistent rule for what happens when a link is missing: the button is disabled rather than falling back to a generic search.

## Data source

The card sync already pulls `server/data/allCards.json` from `lorcanajson.org`, and each card's `externalLinks` object already contains ready-made URLs for all three marketplaces:

```json
"externalLinks": {
  "cardTraderId": 258961,
  "cardTraderUrl": "https://www.cardtrader.com/cards/258961",
  "cardmarketId": 727081,
  "cardmarketUrl": "https://www.cardmarket.com/en/Lorcana/Products/Singles/The-First-Chapter/Ariel-On-Human-Legs?language=1",
  "tcgPlayerId": 494102,
  "tcgPlayerUrl": "https://www.tcgplayer.com/product/494102"
}
```

Today only `tcgPlayerId` is persisted; `cardTraderUrl`/`cardmarketUrl` are parsed off the JSON but discarded during upsert. No new external integration is needed — this is purely wiring up data that's already fetched.

Not every card has every link. In the current dataset (2966 cards): all have a CardTrader link, 9 lack a CardMarket link, 33 lack a TCGPlayer link (e.g. some promo variants).

## Design

### Storage

Store the full URLs directly rather than IDs, for both new fields:

- `Card.cardTraderUrl String?`
- `Card.cardmarketUrl String?`

Rationale: CardMarket's URL includes a localized name/set slug that cannot be reconstructed from the ID alone — the source only gives us a usable link, not a formula. CardTrader's URL is a simple `cardtrader.com/cards/{id}` pattern, but there's no reason to reconstruct it client-side when the ready-made URL is already in the sync payload. Storing URLs directly also means no product-URL-format knowledge needs to live in the frontend for these two marketplaces.

No new IDs are stored (they aren't used anywhere else in the app).

### Schema migration

Add `cardTraderUrl` and `cardmarketUrl` as nullable `String` columns on `Card` in `server/prisma/schema.prisma`, with a new Prisma migration. No index needed (unlike `tcgPlayerId`, these aren't queried/joined on).

### Sync and seed

- `server/src/services/cardSync.ts`: widen the `LorcanaCard.externalLinks` inline type to include `cardTraderUrl?: string` and `cardmarketUrl?: string`, and add both fields (`?? null`) to the `create` and `update` blocks of the `prisma.card.upsert` call in `upsertCards`, following the exact pattern already used for `tcgPlayerId`.
- `server/prisma/seed.ts`: same widening and same fields added to its `create`/`update` blocks, mirroring `upsertCards` (this file already duplicates the tcgPlayerId logic and needs to stay in sync, per the existing `cff118a` fix commit).
- No route changes needed — `GET /api/cards` and `GET /api/cards/:id` return raw Prisma rows with no `select` filter, so new columns flow through automatically.
- No new sync flow, cron, or button — this rides the existing "Sync Cards" sync (`POST /api/sync/refresh`), which already runs periodically per `docs/superpowers/plans/2026-07-03-*` (nightly cron) and on-demand.
- No CardTrader/CardMarket *price* sync is added — that's a separate concern (pricing data isn't available from either marketplace via any integration this app currently has), out of scope.

### Frontend type

Add to `client/src/types/index.ts` `Card` interface:

```ts
cardTraderUrl: string | null;
cardmarketUrl: string | null;
```

### UI behavior

All three marketplace buttons (TCGPlayer, CardTrader, CardMarket) follow the same rule: **if the link is null, the button renders disabled** — no `href`, not clickable, visually muted. This is a behavior change for TCGPlayer, which today falls back to a TCGPlayer text-search URL when `tcgPlayerId` is null; that fallback is removed for consistency.

- TCGPlayer href becomes: `card.tcgPlayerId != null ? \`https://www.tcgplayer.com/product/${card.tcgPlayerId}\` : null` (search-fallback branch deleted).
- CardTrader href: `card.cardTraderUrl` (already null or a full URL).
- CardMarket href: `card.cardmarketUrl` (already null or a full URL).

### Shared component

The href-or-disabled logic is currently duplicated inline for TCGPlayer in both `client/src/components/CardDetail.tsx` and `client/src/pages/CardDetailPage.tsx`. Adding two more buttons in both places would triple that duplication (6 near-identical blocks), so extract a small shared component:

`client/src/components/MarketplaceLink.tsx`:

```tsx
interface MarketplaceLinkProps {
  href: string | null;
  label: string;
  colorClass: string; // e.g. "bg-purple-700/30 hover:bg-purple-700/50 text-purple-300 border-purple-700/50"
}

export default function MarketplaceLink({ href, label, colorClass }: MarketplaceLinkProps) {
  if (!href) {
    return (
      <span
        aria-disabled="true"
        title="Link not available"
        className="text-xs bg-gray-800/30 text-gray-600 border border-gray-700/30 rounded-md px-3 py-1.5 cursor-not-allowed"
      >
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-xs border rounded-md px-3 py-1.5 transition-colors ${colorClass}`}
    >
      {label}
    </a>
  );
}
```

Both `CardDetail.tsx` (compact modal, pills include an emoji prefix e.g. `📊 TCGPlayer`) and `CardDetailPage.tsx` (full page, no emoji, `block`/inline pill layout) render three `MarketplaceLink`s in place of their current single TCGPlayer `<a>`, using their existing layout wrapper (flex row / stacked block) unchanged. Existing eBay and Facebook links are untouched — they don't have a "missing link" concept since they're always-available search URLs.

Suggested colors to keep each marketplace visually distinct from the existing purple TCGPlayer, teal/blue eBay pills, and sky Facebook pill: CardTrader in teal (`bg-teal-700/30 hover:bg-teal-700/50 text-teal-300 border-teal-700/50`), CardMarket in orange (`bg-orange-700/30 hover:bg-orange-700/50 text-orange-300 border-orange-700/50`).

## Out of scope

- No CardTrader/CardMarket price data or price tables — only link buttons.
- No changes to `CardGrid.tsx` tiles — marketplace links only ever appeared in the two detail views, and stay there.
- No backfill script beyond the existing "Sync Cards" button/cron — running it re-upserts every card and populates the new columns for the whole catalog in one pass.

## Verification

1. Run the new Prisma migration; confirm `cardTraderUrl`/`cardmarketUrl` columns exist and are nullable.
2. Trigger "Sync Cards" from the database page; confirm (via `psql` or Prisma Studio) that cards now have non-null `cardTraderUrl` and (for most) `cardmarketUrl`.
3. Open a card with all three links present (e.g. any base-set card) in both the quick-view modal and `/database/:cardId` — all three buttons are active and open the correct marketplace page in a new tab.
4. Open the "White Rabbit - Late Again" promo variant (missing `tcgPlayerId`/`tcgPlayerUrl` per the JSON data) — TCGPlayer button renders disabled (grayed out, no click), CardTrader/CardMarket remain active.
5. Confirm disabled buttons show the "Link not available" tooltip and are not keyboard-focusable/clickable.
