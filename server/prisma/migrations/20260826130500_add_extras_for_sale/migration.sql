-- Add owner-configurable keep policies, per-card retention overrides,
-- and explicit extras-for-sale listings.

CREATE TABLE IF NOT EXISTS "UserInventoryPolicy" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "keepNormalQuantity" INTEGER NOT NULL DEFAULT 4,
  "keepFoilQuantity" INTEGER NOT NULL DEFAULT 1,
  "keepHolofoilQuantity" INTEGER NOT NULL DEFAULT 1,
  "autoSuggestExtras" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserInventoryPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserInventoryPolicy_userId_key" ON "UserInventoryPolicy"("userId");
CREATE INDEX IF NOT EXISTS "UserInventoryPolicy_userId_idx" ON "UserInventoryPolicy"("userId");

ALTER TABLE "UserInventoryPolicy"
  ADD CONSTRAINT "UserInventoryPolicy_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "CardRetentionOverride" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "keepNormalQuantity" INTEGER,
  "keepFoilQuantity" INTEGER,
  "keepHolofoilQuantity" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CardRetentionOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CardRetentionOverride_userId_cardId_key" ON "CardRetentionOverride"("userId", "cardId");
CREATE INDEX IF NOT EXISTS "CardRetentionOverride_userId_idx" ON "CardRetentionOverride"("userId");
CREATE INDEX IF NOT EXISTS "CardRetentionOverride_cardId_idx" ON "CardRetentionOverride"("cardId");

ALTER TABLE "CardRetentionOverride"
  ADD CONSTRAINT "CardRetentionOverride_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CardRetentionOverride"
  ADD CONSTRAINT "CardRetentionOverride_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ExtraForSaleListing" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "variant" TEXT NOT NULL,
  "desiredQuantity" INTEGER NOT NULL,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExtraForSaleListing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExtraForSaleListing_userId_cardId_variant_key" ON "ExtraForSaleListing"("userId", "cardId", "variant");
CREATE INDEX IF NOT EXISTS "ExtraForSaleListing_userId_idx" ON "ExtraForSaleListing"("userId");
CREATE INDEX IF NOT EXISTS "ExtraForSaleListing_cardId_idx" ON "ExtraForSaleListing"("cardId");
CREATE INDEX IF NOT EXISTS "ExtraForSaleListing_status_idx" ON "ExtraForSaleListing"("status");

ALTER TABLE "ExtraForSaleListing"
  ADD CONSTRAINT "ExtraForSaleListing_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExtraForSaleListing"
  ADD CONSTRAINT "ExtraForSaleListing_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
