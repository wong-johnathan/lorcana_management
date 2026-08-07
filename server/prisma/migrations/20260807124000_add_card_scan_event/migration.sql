CREATE TABLE "CardScanEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "recognizedJson" JSONB NOT NULL,
    "candidateJson" JSONB NOT NULL,
    "predictedCardId" TEXT,
    "selectedCardId" TEXT,
    "outcome" TEXT,
    "processingMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardScanEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CardScanEvent_userId_createdAt_idx" ON "CardScanEvent"("userId", "createdAt");
CREATE INDEX "CardScanEvent_predictedCardId_idx" ON "CardScanEvent"("predictedCardId");
CREATE INDEX "CardScanEvent_selectedCardId_idx" ON "CardScanEvent"("selectedCardId");

ALTER TABLE "CardScanEvent" ADD CONSTRAINT "CardScanEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardScanEvent" ADD CONSTRAINT "CardScanEvent_predictedCardId_fkey"
  FOREIGN KEY ("predictedCardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CardScanEvent" ADD CONSTRAINT "CardScanEvent_selectedCardId_fkey"
  FOREIGN KEY ("selectedCardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;