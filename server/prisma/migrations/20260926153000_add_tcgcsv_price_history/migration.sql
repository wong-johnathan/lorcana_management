-- Add daily TCGCSV historical price snapshot storage.

CREATE TABLE "TcgcsvPriceSnapshotRun" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL DEFAULT 71,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "groupCount" INTEGER NOT NULL DEFAULT 0,
    "successfulGroups" INTEGER NOT NULL DEFAULT 0,
    "failedGroups" INTEGER NOT NULL DEFAULT 0,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorSummary" JSONB,

    CONSTRAINT "TcgcsvPriceSnapshotRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TcgcsvPriceSnapshot" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "variant" TEXT NOT NULL,
    "lowPrice" DECIMAL(12,2),
    "midPrice" DECIMAL(12,2),
    "highPrice" DECIMAL(12,2),
    "marketPrice" DECIMAL(12,2),
    "directLowPrice" DECIMAL(12,2),

    CONSTRAINT "TcgcsvPriceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TcgcsvPriceSnapshotRun_categoryId_sourceUpdatedAt_key"
    ON "TcgcsvPriceSnapshotRun"("categoryId", "sourceUpdatedAt");

CREATE INDEX "TcgcsvPriceSnapshotRun_sourceUpdatedAt_idx"
    ON "TcgcsvPriceSnapshotRun"("sourceUpdatedAt");

CREATE INDEX "TcgcsvPriceSnapshotRun_status_idx"
    ON "TcgcsvPriceSnapshotRun"("status");

CREATE UNIQUE INDEX "TcgcsvPriceSnapshot_runId_productId_variant_key"
    ON "TcgcsvPriceSnapshot"("runId", "productId", "variant");

CREATE INDEX "TcgcsvPriceSnapshot_productId_variant_runId_idx"
    ON "TcgcsvPriceSnapshot"("productId", "variant", "runId");

CREATE INDEX "TcgcsvPriceSnapshot_runId_groupId_idx"
    ON "TcgcsvPriceSnapshot"("runId", "groupId");

ALTER TABLE "TcgcsvPriceSnapshot"
    ADD CONSTRAINT "TcgcsvPriceSnapshot_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "TcgcsvPriceSnapshotRun"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
