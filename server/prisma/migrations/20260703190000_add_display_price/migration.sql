-- AlterTable
ALTER TABLE "Card" ADD COLUMN "displayPrice" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Card_displayPrice_idx" ON "Card"("displayPrice");
