# Sort by Market Price Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users sort the card database grid by market price (low-to-high or high-to-low), with unpriced cards always sorting to the end.

**Architecture:** Prisma cannot sort a `Card.findMany` by an arbitrary field on the to-many `CardPrice` relation, so denormalize the card's effective display price (the same "Normal variant, else first available" rule already used by the grid tile) onto a new `Card.displayPrice` column, kept in sync during price sync. Sorting then becomes a plain, native `orderBy` on that scalar field, composing for free with existing filters/pagination. The frontend adds one more `<select>` to the existing `FilterBar` following its established single-select pattern.

**Tech Stack:** Express + Prisma + PostgreSQL (server), React + TypeScript (Vite) + Tailwind (client). No test framework exists in this repo — verification is via `tsc` typechecking and manual DB/API/browser checks, matching prior plans in this repo (e.g. `docs/superpowers/plans/2026-07-03-marketplace-links.md`).

## Global Constraints

- Price definition: `Normal` variant's `marketPrice`, falling back to whichever `CardPrice` row exists first — identical to `client/src/components/CardGrid.tsx:37-38`'s existing display rule.
- Both sort directions supported: low-to-high (`price_asc`) and high-to-low (`price_desc`).
- Cards with no price data (`displayPrice` is `null`) always sort to the end, regardless of direction — use Prisma's `nulls: "last"` order modifier, not default SQL null ordering.
- No raw SQL — sorting must go through Prisma's native `orderBy` on `Card.displayPrice`.
- No changes to `CardDetail.tsx`/`CardDetailPage.tsx` — this is a database-grid-only feature.
- No new sync flow — `displayPrice` rides the existing "Sync Prices" flow (`priceSync.ts`).

---

### Task 1: Add `displayPrice` column to the `Card` model

**Files:**
- Modify: `server/prisma/schema.prisma:10-42` (the `Card` model)
- Create: `server/prisma/migrations/20260703190000_add_display_price/migration.sql`

**Interfaces:**
- Produces: `Card.displayPrice: number | null` (Prisma-generated type), consumed by Task 2 (price sync write) and Task 3 (API sort read).

- [ ] **Step 1: Add the column to the Prisma schema**

In `server/prisma/schema.prisma`, in `model Card`, change:

```prisma
model Card {
  id            String   @id @default(cuid())
  externalId    Int      @unique
  tcgPlayerId   Int?
  cardTraderUrl String?
  cardmarketUrl String?
  name          String
```

to:

```prisma
model Card {
  id            String   @id @default(cuid())
  externalId    Int      @unique
  tcgPlayerId   Int?
  cardTraderUrl String?
  cardmarketUrl String?
  displayPrice  Float?
  name          String
```

And add an index for it alongside the existing indexes at the bottom of the model:

```prisma
  @@index([name])
  @@index([color])
  @@index([setName])
  @@index([rarity])
  @@index([tcgPlayerId])
  @@index([displayPrice])
}
```

- [ ] **Step 2: Create the migration file**

Create directory `server/prisma/migrations/20260703190000_add_display_price/` with file `migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Card" ADD COLUMN "displayPrice" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Card_displayPrice_idx" ON "Card"("displayPrice");
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `cd server && npx prisma generate`
Expected: `Generated Prisma Client` success message, no errors.

- [ ] **Step 4: Apply the migration and typecheck the server**

Run: `cd server && npx prisma migrate deploy` (requires the dev Postgres container running — `docker compose up -d db` if it isn't already)
Expected: `Applying migration 20260703190000_add_display_price` ... `The following migration(s) have been applied` with no errors.

Run: `cd server && npx tsc -p . --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260703190000_add_display_price
git commit -m "Add displayPrice column to Card model"
```

---

### Task 2: Persist `displayPrice` during price sync

**Files:**
- Modify: `server/src/services/priceSync.ts:85-106` (the per-card upsert loop inside `syncGroupPrices`)

**Interfaces:**
- Consumes: `Card.displayPrice` column from Task 1.
- Produces: populated `Card.displayPrice` on every card that has at least one synced `CardPrice` row — consumed by Task 3's sort query.

- [ ] **Step 1: Recompute and persist `displayPrice` after each card's variant prices are upserted**

In `server/src/services/priceSync.ts`, inside `syncGroupPrices`, change:

```ts
          for (const card of matchingCards) {
            for (const vp of variantPrices) {
              await prisma.cardPrice.upsert({
                where: { cardId_variant: { cardId: card.id, variant: vp.subTypeName } },
                create: {
                  cardId: card.id,
                  variant: vp.subTypeName,
                  lowPrice: vp.lowPrice,
                  midPrice: vp.midPrice,
                  highPrice: vp.highPrice,
                  marketPrice: vp.marketPrice,
                },
                update: {
                  lowPrice: vp.lowPrice,
                  midPrice: vp.midPrice,
                  highPrice: vp.highPrice,
                  marketPrice: vp.marketPrice,
                },
              });
            }
          }
          matched += matchingCards.length;
```

to:

```ts
          for (const card of matchingCards) {
            for (const vp of variantPrices) {
              await prisma.cardPrice.upsert({
                where: { cardId_variant: { cardId: card.id, variant: vp.subTypeName } },
                create: {
                  cardId: card.id,
                  variant: vp.subTypeName,
                  lowPrice: vp.lowPrice,
                  midPrice: vp.midPrice,
                  highPrice: vp.highPrice,
                  marketPrice: vp.marketPrice,
                },
                update: {
                  lowPrice: vp.lowPrice,
                  midPrice: vp.midPrice,
                  highPrice: vp.highPrice,
                  marketPrice: vp.marketPrice,
                },
              });
            }

            const allPrices = await prisma.cardPrice.findMany({ where: { cardId: card.id } });
            const displayPrice = allPrices.find((p) => p.variant === "Normal")?.marketPrice
              ?? allPrices[0]?.marketPrice
              ?? null;
            await prisma.card.update({ where: { id: card.id }, data: { displayPrice } });
          }
          matched += matchingCards.length;
```

This mirrors `client/src/components/CardGrid.tsx:37-38`'s existing "Normal, else first" rule exactly, at write time instead of render time.

- [ ] **Step 2: Typecheck**

Run: `cd server && npx tsc -p . --noEmit`
Expected: no errors.

- [ ] **Step 3: Run a price sync and confirm `displayPrice` populates correctly**

With the server running (`docker compose up -d db server`), trigger a price sync — either via the app's "Sync Prices" button, or directly:

```bash
curl -s -X POST http://localhost/api/sync/prices
```

(If this requires authentication in your environment, use the app's "Sync Prices" button instead, or check `server/src/routes/sync.ts` for the exact route.) Then inspect the DB:

```bash
docker compose exec db psql -U lorcana -d lorcana_inventory -c \
  "SELECT c.name, c.\"displayPrice\", cp.variant, cp.\"marketPrice\" FROM \"Card\" c JOIN \"CardPrice\" cp ON cp.\"cardId\" = c.id WHERE c.\"displayPrice\" IS NOT NULL ORDER BY c.name LIMIT 10;"
```

Expected: for cards with a `Normal` variant row, `displayPrice` matches that row's `marketPrice`; for cards with only foil variants, `displayPrice` matches whichever variant's `marketPrice` appears first.

- [ ] **Step 4: Commit**

```bash
git add server/src/services/priceSync.ts
git commit -m "Persist displayPrice during price sync"
```

---

### Task 3: Add `sort` query param to `GET /api/cards`

**Files:**
- Modify: `server/src/routes/cards.ts:49-61` (destructured query params) and `server/src/routes/cards.ts:106-119` (orderBy construction and the `prisma.card.findMany` call)

**Interfaces:**
- Consumes: `Card.displayPrice` column from Task 1.
- Produces: `GET /api/cards?sort=price_asc` and `GET /api/cards?sort=price_desc` return cards ordered by `displayPrice` (nulls last); any other/absent `sort` value preserves the existing `[{setCode: asc}, {name: asc}]` order. Consumed by the frontend in Task 4 via the existing generic `filters` → request-params flow.

- [ ] **Step 1: Add `sort` to the destructured query params**

In `server/src/routes/cards.ts`, change:

```ts
    const {
      search,
      color,
      set,
      rarity,
      type,
      character,
      cardType,
      ownership,
      analyzed,
      page = "1",
      limit = "40",
    } = req.query;
```

to:

```ts
    const {
      search,
      color,
      set,
      rarity,
      type,
      character,
      cardType,
      ownership,
      analyzed,
      sort,
      page = "1",
      limit = "40",
    } = req.query;
```

- [ ] **Step 2: Build the `orderBy` array based on `sort` and use it in the query**

Change:

```ts
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 40));
    const skip = (pageNum - 1) * limitNum;

    const [cards, total] = await Promise.all([
      prisma.card.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: [{ setCode: "asc" }, { name: "asc" }],
        include: { prices: true },
      }),
      prisma.card.count({ where }),
    ]);
```

to:

```ts
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 40));
    const skip = (pageNum - 1) * limitNum;

    const defaultOrderBy = [{ setCode: "asc" as const }, { name: "asc" as const }];
    const sortOrderBy =
      sort === "price_asc"
        ? [{ displayPrice: { sort: "asc" as const, nulls: "last" as const } }, ...defaultOrderBy]
        : sort === "price_desc"
        ? [{ displayPrice: { sort: "desc" as const, nulls: "last" as const } }, ...defaultOrderBy]
        : defaultOrderBy;

    const [cards, total] = await Promise.all([
      prisma.card.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: sortOrderBy,
        include: { prices: true },
      }),
      prisma.card.count({ where }),
    ]);
```

- [ ] **Step 3: Typecheck**

Run: `cd server && npx tsc -p . --noEmit`
Expected: no errors.

- [ ] **Step 4: Manually verify the sort param via curl**

With the server running and a price sync already completed (Task 2, Step 3):

```bash
curl -s "http://localhost/api/cards?sort=price_asc&limit=5" | python3 -c "
import json,sys
data = json.load(sys.stdin)
for c in data['cards']:
    print(c['name'], c['displayPrice'])
"
```

Expected: `displayPrice` values in ascending order (nulls, if any appear this early, only would if fewer than 5 cards have prices — unlikely given ~2900 priced cards).

```bash
curl -s "http://localhost/api/cards?sort=price_desc&limit=5" | python3 -c "
import json,sys
data = json.load(sys.stdin)
for c in data['cards']:
    print(c['name'], c['displayPrice'])
"
```

Expected: `displayPrice` values in descending order, highest first.

```bash
curl -s "http://localhost/api/cards?sort=price_asc&limit=200" | python3 -c "
import json,sys
data = json.load(sys.stdin)
nulls = [c for c in data['cards'] if c['displayPrice'] is None]
non_nulls = [c for c in data['cards'] if c['displayPrice'] is not None]
print('null count in first 200:', len(nulls))
print('all non-null before any null:', data['cards'].index(nulls[0]) == len(non_nulls) if nulls else 'no nulls in first 200')
"
```

Expected: any null-priced cards appear only after all priced cards within the page (confirms `nulls: "last"` is working) — if the full catalog has more than 200 priced cards, this page may show zero nulls, which is also a valid pass (means the check is inconclusive at this page size, not failing); if so, additionally check with `limit=100&page=<last page>` or query the total priced-vs-unpriced count via `docker compose exec db psql ...` to confirm nulls exist and land at the very end of an unfiltered `price_asc` scan across all pages.

- [ ] **Step 5: Confirm sort composes with existing filters**

```bash
curl -s "http://localhost/api/cards?color=Amber&sort=price_desc&limit=10" | python3 -c "
import json,sys
data = json.load(sys.stdin)
print(all(c['color'] == 'Amber' for c in data['cards']))
print([c['displayPrice'] for c in data['cards']])
"
```

Expected: `True` (all Amber), and prices in descending order.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/cards.ts
git commit -m "Add sort=price_asc/price_desc query param to GET /api/cards"
```

---

### Task 4: Add the sort control to the frontend and verify end-to-end

**Files:**
- Modify: `client/src/components/FilterBar.tsx:275-297` (add a new `<select>` after the existing "AI Analysis" select)
- Modify: `client/src/pages/DatabasePage.tsx:12` (the `filtersFromParams` tracked-keys array)

**Interfaces:**
- Consumes: `GET /api/cards?sort=...` from Task 3. `FilterBar`'s existing generic `update(key, value)` helper and `filters`/`onChange` props (unchanged signatures).

- [ ] **Step 1: Add the sort `<select>` to `FilterBar.tsx`**

In `client/src/components/FilterBar.tsx`, change:

```tsx
      <select
        value={filters.analyzed || ""}
        onChange={(e) => update("analyzed", e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
      >
        <option value="">AI Analysis</option>
        <option value="yes">Analyzed</option>
        <option value="no">Not Analyzed</option>
      </select>

      {showOwnership && (
```

to:

```tsx
      <select
        value={filters.analyzed || ""}
        onChange={(e) => update("analyzed", e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
      >
        <option value="">AI Analysis</option>
        <option value="yes">Analyzed</option>
        <option value="no">Not Analyzed</option>
      </select>

      <select
        value={filters.sort || ""}
        onChange={(e) => update("sort", e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
      >
        <option value="">Sort: Default</option>
        <option value="price_asc">Price: Low to High</option>
        <option value="price_desc">Price: High to Low</option>
      </select>

      {showOwnership && (
```

- [ ] **Step 2: Track `sort` in `DatabasePage.tsx`'s URL-synced filter keys**

In `client/src/pages/DatabasePage.tsx`, change:

```ts
function filtersFromParams(params: URLSearchParams): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const key of ["search", "color", "set", "rarity", "type", "cardType", "ownership", "analyzed"]) {
    const val = params.get(key);
    if (val) filters[key] = val;
  }
  return filters;
}
```

to:

```ts
function filtersFromParams(params: URLSearchParams): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const key of ["search", "color", "set", "rarity", "type", "cardType", "ownership", "analyzed", "sort"]) {
    const val = params.get(key);
    if (val) filters[key] = val;
  }
  return filters;
}
```

No other client-side change is needed: `loadCards` already spreads `filters` generically into the request params (`client/src/pages/DatabasePage.tsx:81-85`), and `handleFilterChange`/`syncToUrl` already reset to page 1 and sync any filter key to the URL generically.

- [ ] **Step 3: Typecheck**

Run: `cd client && npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Full manual verification in the browser**

Run `cd client && npm run dev` and (if not already running) `cd server && npm run dev` / `docker compose up -d db server`, with a price sync already run per Task 2 Step 3 so `displayPrice` is populated.

- Open the database page. Select "Price: Low to High" in the new sort dropdown. Confirm the grid re-renders starting with the cheapest cards, and the URL updates to include `?sort=price_asc`.
- Select "Price: High to Low". Confirm the grid now starts with the most expensive cards, and the URL updates to `?sort=price_desc`.
- Scroll down to trigger infinite scroll (loading more pages). Confirm the appended cards continue the same sorted order (e.g. prices keep decreasing for `price_desc`, not reset back to the default set/name order).
- Reload the page directly at a URL containing `?sort=price_asc` (or whichever the address bar shows). Confirm the sort dropdown reflects the selection and the grid loads pre-sorted.
- Select "Sort: Default" again and confirm the grid returns to today's existing set/name order.
- Combine the sort with an existing filter (e.g. pick a color filter, then a sort direction) and confirm both apply together.

Expected: sort dropdown correctly reorders the grid in both directions, persists across pagination and page reload via the URL, and composes with other filters; no console errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/FilterBar.tsx client/src/pages/DatabasePage.tsx
git commit -m "Add sort-by-market-price control to the database grid"
```

---

## Self-Review Notes

- **Spec coverage:** Schema/migration (Task 1), price-sync persistence (Task 2), API sort param with nulls-last (Task 3), frontend control + URL sync (Task 4) — all spec sections covered. Out-of-scope items (per-variant sort choice, `CardDetail`/`CardDetailPage` changes, new sync flows) are correctly untouched by any task.
- **Placeholder scan:** None — every step has literal code, exact file paths, and runnable commands.
- **Type consistency:** `Card.displayPrice: number | null` defined once in Task 1, written in Task 2 via the identical Normal-else-first rule, and read in Task 3's `orderBy`. The `sort` query-param values (`"price_asc"` / `"price_desc"`) are defined once in Task 3's route and consumed with matching string literals in Task 4's `<option value="...">` elements.
