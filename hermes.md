# Hermes Context: Lorcana Inventory Manager

This file is the high-signal working context for AI contributors. Keep it concise and update it when architecture, workflows, or product contracts change.

## Project identity

- **Repo:** `wong-johnathan/lorcana_management`
- **Purpose:** A dark-themed Disney Lorcana TCG collection manager for browsing the card database, tracking a personal inventory, estimating master-set costs, checking market prices, and sharing read-only public collections.
- **Primary deployment model:** Docker Compose with prebuilt DockerHub images for production.
- **Important distinction:** This is the original Express/React app. A separate Next.js SEO rebuild exists in another repo; do not mix assumptions from that project into this one.

## Stack at a glance

| Layer | Technology | Key paths |
|---|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, React Router 7 | `client/`, `client/src/` |
| Backend | Express 5, TypeScript | `server/src/` |
| ORM / DB | Prisma, PostgreSQL 16 | `server/prisma/` |
| Auth | JWT + bcrypt, token stored in localStorage | `server/src/routes/auth.ts`, `client/src/context/AuthContext.tsx` |
| Card source | LorcanaJSON local/remote sync | `server/data/allCards.json`, `server/src/services/cardSync.ts` |
| Price source | tcgcsv.com bulk prices, plus AI market analysis | `server/src/services/priceSync.ts`, `server/src/services/analysis.ts` |
| Infra | Docker Compose, nginx, GitHub Actions | `docker-compose*.yml`, `nginx/`, `.github/workflows/ci.yml` |

## Runtime architecture

```text
Browser React SPA
  -> nginx / Vite dev proxy
  -> Express API on :3001
  -> PostgreSQL via Prisma

External data paths:
  LorcanaJSON -> allCards.json -> Card table
  tcgcsv.com  -> CardPrice table -> displayPrice on Card
  Search/SearXNG + DeepSeek -> CardAnalysis table
```

The API is mounted under `/api`:

- `/api/auth` — register/login/config.
- `/api/cards` — card database, filters, card detail, master-set estimates, market analysis.
- `/api/inventory` — authenticated inventory CRUD, stats, CSV export, wipe.
- `/api/sync` — authenticated card sync and price sync, with progress/status endpoints.
- `/api/settings` — authenticated profile settings, currently public collection visibility.
- `/api/public` — read-only public collection endpoint.

## Product surfaces and current feature set

### Public / shared surfaces

- `/database` — searchable/paginated card database.
  - Filters: search, color, set, rarity, subtype/type, character, card type, ownership, analysis status, price status/variant.
  - Sorts by numeric set number, numeric collector number, card number, then name; price sort is also supported.
  - Card clicks open `CardDetail`; direct route `/database/:cardId` exists for full card detail.
- `/master-set` — master-set cost calculator.
  - Estimates selected rarities and selected variants using configurable price field (`marketPrice`, `lowPrice`, `midPrice`, `highPrice`).
  - User-facing `Foil` aliases price rows like `Foil`, `Cold Foil`, and `Holofoil` where needed.
  - Drilldowns open in-page card-grid modals and support CSV export.
- `/collection/:userId` — public read-only collection share page.
  - Only visible when the owner enables sharing in settings.
  - Reuses the database-style card grid and filters, but must remain read-only: no add/remove/wipe/stepper controls.
  - Includes collection stats and estimated value when prices exist.

### Authenticated surfaces

- `/inventory` — the user's collection.
  - Supports filters, stats, total value, missing-price count, per-set breakdown, CSV export, wipe, and item removal.
  - Supports both rows and grid views; the selected view is stored in localStorage.
- `/settings` — profile settings.
  - Public collection toggle and copyable public URL.
- Auth flows:
  - Login/register are username/password backed by bcrypt and JWT.
  - Registration can be disabled with `REGISTER=false`.
  - The client auto-logs out when JWTs are expired or when API returns `401` with `Invalid or expired token`.

### Inventory variant model

Inventory tracks three quantities per card:

- `quantity` — normal copies.
- `foilQuantity` — regular foil / Silver-style copies.
- `holofoilQuantity` — premium/holofoil-style copies.

Variant availability comes from LorcanaJSON `Card.foilTypes`, not hardcoded rarity rules. Reuse `client/src/utils/cardVariants.ts` for UI derivation. The backend validates requested quantities against available variants; UI hiding is not the security boundary.

Typical mapping:

- `None` -> Normal.
- `Silver` -> Foil.
- premium foil types such as `Lava`, `Magma`, `Satin`, `Lore`, `Glitter`, etc. -> Holofoil.

### Card detail and market analysis

`CardDetail` is a full-screen modal used by database, inventory, master-set, and public collection flows. It shows large art, stats/abilities, market links, collection counts, add controls when allowed, and AI market analysis state.

Market links use card name/subtitle/card number where appropriate:

- eBay sold/live/auction queries include short card number.
- TCGPlayer and Facebook queries use name/subtitle without card number.

AI market analysis:

- `GET /api/cards/:id/analysis` returns structured fields plus status.
- `POST /api/cards/:id/analyze` starts per-card analysis.
- `POST /api/cards/analyze-batch` is admin-only for selected high-value rarities.
- Analysis data is stored as JSON text in `CardAnalysis.analysis` and rendered with markdown support on the client.

## Data model summary

Prisma models live in `server/prisma/schema.prisma`:

- `Card` — Lorcana card metadata, image, LorcanaJSON external ID, optional TCGPlayer ID, display price, `foilTypes`, relations to prices/analysis/inventory.
- `CardPrice` — per-card price rows by variant with low/mid/high/market prices.
- `CardAnalysis` — per-card AI market analysis with status and timestamps.
- `User` — username, password hash, public sharing flag.
- `InventoryEntry` — one row per user/card with normal, foil, and holofoil counts.

When schema changes, commit both `schema.prisma` and a matching migration directory under `server/prisma/migrations/`. CI/prod use `npx prisma migrate deploy`; a green TypeScript build does not prove migrations are correct.

## What has already been done

High-level completed work in this repo:

- Core React SPA + Express API + PostgreSQL/Prisma foundation.
- JWT auth with configurable registration, token-expiry handling, and auth-gated routes.
- LorcanaJSON card ingestion from local JSON and remote refresh.
- Card database with rich filters, pagination, numeric set/card ordering, card detail modals, and price/analysis filters.
- Personal inventory CRUD with normal/foil/holofoil counts, value stats, CSV export, and wipe support.
- Variant-aware inventory controls based on LorcanaJSON `foilTypes`.
- tcgcsv bulk price sync with scheduled daily refresh at 21:00 UTC.
- AI per-card market analysis and admin batch analysis for selected rarities.
- Public collection sharing with read-only database-style card grid.
- Master-set cost calculator with variant/rarity selection, price-field selection, drilldown modals, and CSV export.
- Production Docker Compose, nginx reverse proxy, GitHub Actions CI/CD, and DockerHub image publishing.
- Old scanner flows were removed from this repo.

## Known constraints and traps

- **Scanner code is intentionally absent.** Do not reintroduce Gemini scanning, no-LLM scanning, OpenCV/Tesseract deps, scanner routes, or `/scan` pages unless explicitly requested.
- **LorcanaJSON coverage gap:** It covers expansion/quest sets, not all promos/championship/league/event exclusives. Promo support needs a supplemental source/seed plan.
- **tcgcsv data can be partial:** Some group price endpoints return missing data. That is often upstream data absence, not a local bug.
- **New sets may lack `tcgPlayerId`:** Price sync depends on LorcanaJSON external links. If IDs are missing, price matching will be zero even when tcgcsv has prices.
- **Express route order matters:** Specific routes such as `/filters`, `/master-set/estimate`, `/:id/analysis`, and `/:id/analyze` must be registered before generic `/:id` handlers.
- **Auth expiry chain matters:** Keep the API client's 401 `auth:expired` event and `AuthContext` listener intact.
- **SPA cache trap:** New routes can appear broken in normal browsers if nginx serves a cached `index.html`; production nginx should avoid long-lived caching for the HTML shell while keeping hashed assets cacheable.
- **Public collection must stay read-only:** Reuse display components carefully; do not leak authenticated inventory actions into public routes.

## Contribution workflow

1. **Start from the real code, not memory.** Inspect the relevant route/component/schema before editing.
2. **Keep contracts aligned across layers.** If API response shape changes, update `client/src/types/index.ts`, `client/src/services/api.ts`, affected UI, server route, and Prisma migration if needed.
3. **Prefer shared helpers over duplicate logic.** Variant behavior belongs in `client/src/utils/cardVariants.ts` and backend validation helpers, not per-page ad hoc conditions.
4. **Preserve route behavior.** Public routes (`/database`, `/master-set`, `/collection/:userId`) must work without auth. Authenticated routes (`/inventory`, `/settings`) must remain gated.
5. **Use user-visible errors for async actions.** Sync/analyze/import buttons should not fail silently with only `console.error`.
6. **Do not add dependencies casually.** This is a small full-stack app; earn every new package.
7. **Commit migrations with schema changes.** Never rely on generated Prisma client changes alone.
8. **For docs-only changes, at minimum run a diff/status check. For code changes, run the CI-equivalent checks below before pushing.**

## Local verification commands

From repo root:

```bash
# Server
cd server
npm ci
npx prisma generate
npx tsc --noEmit

# Client
cd ../client
npm ci
npx tsc --noEmit
npm run build

# Compose validation from repo root
cd ..
docker compose config
docker compose -f docker-compose.prod.yml config
```

There are currently no configured `test` scripts in `client/package.json` or `server/package.json`; GitHub Actions skips unit tests when no test script exists.

## Push / CI expectations

GitHub Actions runs on pushes and pull requests targeting `main`:

1. **Type Check** — server/client install, Prisma generate, `tsc --noEmit`.
2. **Unit Tests** — migrations against PostgreSQL, then skips if no test script exists.
3. **Build** — server `tsc`, client `npm run build`.
4. **Build & Push Docker Images** — main push only, publishes server and nginx images to DockerHub.

After pushing to `main`, check the Actions run and do not call the work complete until CI is green or the failing job is identified.
