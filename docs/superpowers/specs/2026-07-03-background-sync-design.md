# Background Sync for Cards & Prices — Design

## Problem

`POST /api/sync/refresh` (Sync Cards) and `POST /api/sync/prices` (Sync Prices) each perform a long, purely sequential loop of individual database upserts inside a single HTTP request/response cycle:

- `syncFromRemote()` (`server/src/services/cardSync.ts`) fetches ~8MB of card data, then `await`s ~2966 individual `prisma.card.upsert()` calls one at a time.
- `syncLorcanaPrices()` (`server/src/services/priceSync.ts`) loops through ~20 tcgcsv.com price groups, each doing its own nested fetch + several hundred `prisma.cardPrice.upsert()` calls.

On NAS-class hardware this easily exceeds 100 seconds. The production deployment sits behind Cloudflare, which hard-kills any proxied request that doesn't get a response within 100 seconds (Error 524) on non-Enterprise plans — this limit cannot be configured away. The browser sees a failure; the server-side loop may or may not still be running, and if the container restarts (e.g. a Watchtower update) or an unhandled error occurs mid-loop, progress is lost with no record of how far it got.

`upsertCards()` (used by both `seedFromLocal()` and `syncFromRemote()`) also has no per-card error handling — a single card that fails to upsert aborts the entire remaining loop.

## Goals

- Clicking "Sync Cards" or "Sync Prices" returns immediately regardless of how long the underlying sync takes.
- Progress is visible and survives the browser tab closing/reopening (poll-based, not tied to the triggering request).
- A single bad record no longer aborts an otherwise-successful sync run.
- The nightly cron-triggered price sync (`server/src/index.ts:34-38`) surfaces its result in the same status the manual button uses.

## Non-goals

- No job queue / persistence across server restarts — status is in-memory and resets on restart, same tradeoff the existing Batch AI Analysis feature already accepts.
- No change to `prisma/seed.ts` (fixed separately, unrelated to this timeout issue).
- No change to how the LAN-direct workaround works — this fix removes the *need* for it, but doesn't touch it.

## Design

Mirror the existing "Batch AI Analysis" pattern (`server/src/routes/cards.ts:15-23, 179-254`) exactly, since it already solves this same shape of problem in this codebase:

1. A module-level in-memory status object.
2. A `POST` endpoint that: rejects with 409 if already running, does any fast synchronous setup, responds immediately, then continues the slow work in a detached (not-awaited) `(async () => { ... })()` block.
3. A `GET .../status` endpoint returning the current status object, for the frontend to poll.

### Status shape

Two independent trackers, added to `server/src/routes/sync.ts`:

```ts
interface SyncStatus {
  status: "idle" | "running" | "completed" | "error";
  total: number;
  completed: number;
  failed: number;
  currentItem: string | null;
  startedAt: string | null;
}

let cardSyncStatus: SyncStatus = { status: "idle", total: 0, completed: 0, failed: 0, currentItem: null, startedAt: null };
let priceSyncStatus: SyncStatus = { status: "idle", total: 0, completed: 0, failed: 0, currentItem: null, startedAt: null };
```

### `syncFromRemote()` (card sync)

Split into two phases inside `server/src/services/cardSync.ts`:

- `fetchAndSaveRemote(): Promise<LorcanaData>` — fetches the file, `writeFileSync`s it to `server/data/allCards.json` (same volume-backed path used today), parses it, and returns the parsed data. This is the fast part and stays synchronous/awaited before the route responds.
- `upsertCards(data, onProgress?)` — gains an optional progress callback invoked after each card, and **wraps each card's upsert in its own try/catch**, incrementing a `failed` counter and logging instead of throwing and aborting the loop. Returns `{ seeded, failed }` instead of just a count.

`POST /api/sync/refresh` in `sync.ts`:
1. 409 if `cardSyncStatus.status === "running"`.
2. `await fetchAndSaveRemote()` — if this itself throws (network error), respond with an error immediately; nothing has started yet.
3. Set `cardSyncStatus = { status: "running", total: data.cards.length, completed: 0, failed: 0, currentItem: null, startedAt: new Date().toISOString() }`.
4. Respond `{ status: "running", total }`.
5. Detached async block calls `upsertCards(data, (card, i) => { cardSyncStatus.currentItem = card.name; cardSyncStatus.completed = i + 1; })`, catching per-card failures into `cardSyncStatus.failed`. On completion, sets `status` to `"completed"` (or `"error"` if `failed === total`).

### `syncLorcanaPrices()` (price sync)

`server/src/services/priceSync.ts` gains an optional progress callback, invoked after each group finishes (group-level granularity — matches the existing per-group try/catch, no finer-grained change needed there). Returns the same `{ groups, matched, unmatched }` shape it does today.

`POST /api/sync/prices` in `sync.ts` follows the identical shape to `/refresh`: 409 guard, set `priceSyncStatus` to running, respond immediately, run in a detached block, update `completed`/`total` (group count) and `currentItem` (group name) via the callback, finish by setting `status`.

`GET /api/sync/refresh/status` and `GET /api/sync/prices/status` return `cardSyncStatus` / `priceSyncStatus` respectively.

### Cron integration

`server/src/index.ts`'s nightly `cron.schedule` callback currently calls `syncLorcanaPrices()` directly with `.then()/.catch()` logging. It's updated to pass the same progress callback used by the manual route, writing into the same `priceSyncStatus` object (imported from `sync.ts`) — so a completed/failed cron run is visible in the admin UI the next time someone opens the Database page, not just manual clicks.

### Frontend (`client/src/pages/DatabasePage.tsx`)

Add `cardSyncStatus` / `priceSyncStatus` state plus two poll loops, structured identically to the existing `pollBatchStatus`/`batchStatus` (`DatabasePage.tsx:36-39, 162-187`):
- `handleSync`/`handleSyncPrices` (already exist) call the refresh/prices endpoints, then start polling on success.
- Two progress-bar blocks below the button row, styled the same as the existing Batch Analysis progress bar (`DatabasePage.tsx:321-344`), each showing `completed`/`total`, a progress bar, `currentItem`, and `failed` count if nonzero.
- On mount, both statuses are fetched once; if either is already `"running"` (e.g. the cron kicked off a sync, or a previous browser session started one), polling resumes automatically — same behavior as the existing batch-status mount check.

### API client (`client/src/services/api.ts`)

`sync.refresh()` and `sync.prices()` keep their existing signatures (still `POST`, now resolving fast). Add `sync.refreshStatus()` and `sync.pricesStatus()` (`GET`), mirroring `analysis.batchStatus()`.

## Error handling

- Network/fetch failure before any upserts start (e.g. `fetchAndSaveRemote()` throws): route returns a normal error response synchronously, `cardSyncStatus` stays `idle`/unchanged — nothing to report as failed since nothing ran.
- Per-card/per-group failure during the loop: caught, counted, logged, loop continues.
- Whole loop crashes unexpectedly (a bug outside the per-item try/catch): caught by an outer try/catch around the detached async block, sets `status: "error"`.
- Server restart mid-sync: status is lost (in-memory only) — the next page load shows `idle` with no record of the interrupted run, consistent with how Batch AI Analysis already behaves today. Not solved by this design; considered acceptable given the existing precedent.

## Testing

No test framework exists in this repo (client or server) — verified via manual browser testing (Playwright) against the local dev environment (docker-compose, hits real Postgres and a small live fetch to lorcanajson.org), following the same verification approach used for prior changes in this session: trigger each sync, confirm the button/request returns immediately, confirm the progress bar appears and advances, confirm final counts match the previous synchronous behavior.
