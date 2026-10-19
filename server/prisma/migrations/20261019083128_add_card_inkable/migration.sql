-- Additive migration for the enhanced listing filters (REQ-FILT-1).
-- Adds the derived `inkable` boolean (default false) plus the two cheap
-- catalog-filter indexes adopted in D3 (inkCost, cardType). No data is
-- written here; the existing rows read `false` until the sync/seed backfill
-- re-runs over server/data/allCards.json (see rollout note in plan.md).

-- AlterTable
ALTER TABLE "Card" ADD COLUMN "inkable" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Card_inkCost_idx" ON "Card"("inkCost");

-- CreateIndex
CREATE INDEX "Card_cardType_idx" ON "Card"("cardType");
