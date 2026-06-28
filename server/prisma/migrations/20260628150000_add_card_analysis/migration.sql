CREATE TABLE "CardAnalysis" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "analysis" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CardAnalysis_cardId_key" ON "CardAnalysis"("cardId");

ALTER TABLE "CardAnalysis" ADD CONSTRAINT "CardAnalysis_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
