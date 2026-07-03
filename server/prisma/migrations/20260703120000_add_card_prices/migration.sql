-- AlterTable
ALTER TABLE "Card" ADD COLUMN "tcgPlayerId" INTEGER;

-- CreateTable
CREATE TABLE "CardPrice" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "lowPrice" DOUBLE PRECISION,
    "midPrice" DOUBLE PRECISION,
    "highPrice" DOUBLE PRECISION,
    "marketPrice" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Card_tcgPlayerId_idx" ON "Card"("tcgPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "CardPrice_cardId_variant_key" ON "CardPrice"("cardId", "variant");

-- AddForeignKey
ALTER TABLE "CardPrice" ADD CONSTRAINT "CardPrice_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
