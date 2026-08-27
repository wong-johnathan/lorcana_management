ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "emailNormalized" TEXT,
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_emailNormalized_key" ON "User"("emailNormalized");

CREATE TABLE IF NOT EXISTS "MarketplaceReservation" (
  "id" TEXT NOT NULL,
  "listingId" TEXT,
  "buyerId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPriceMinor" INTEGER,
  "shippingPriceMinor" INTEGER,
  "currency" TEXT,
  "fulfilmentMethod" TEXT,
  "buyerCountryCode" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketplaceTransaction" (
  "id" TEXT NOT NULL,
  "reservationId" TEXT,
  "listingId" TEXT,
  "buyerId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "cardId" TEXT,
  "variant" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPriceMinor" INTEGER,
  "shippingPriceMinor" INTEGER,
  "currency" TEXT,
  "fulfilmentMethod" TEXT,
  "buyerCountryCode" TEXT,
  "status" TEXT NOT NULL DEFAULT 'AWAITING_BUYER_CONFIRMATION',
  "completedAt" TIMESTAMP(3),
  "reviewWindowEndsAt" TIMESTAMP(3),
  "disputedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketplaceReview" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "revieweeId" TEXT NOT NULL,
  "reviewerRole" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SEALED',
  "moderationStatus" TEXT NOT NULL DEFAULT 'VISIBLE',
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revealedAt" TIMESTAMP(3),
  "frozenAt" TIMESTAMP(3),
  "hiddenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketplaceReviewTag" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceReviewTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketplaceReport" (
  "id" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "resolvedByUserId" TEXT,
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserBlock" (
  "id" TEXT NOT NULL,
  "blockerId" TEXT NOT NULL,
  "blockedId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceTransaction_reservationId_key" ON "MarketplaceTransaction"("reservationId");
CREATE INDEX IF NOT EXISTS "MarketplaceReservation_listingId_idx" ON "MarketplaceReservation"("listingId");
CREATE INDEX IF NOT EXISTS "MarketplaceReservation_buyerId_idx" ON "MarketplaceReservation"("buyerId");
CREATE INDEX IF NOT EXISTS "MarketplaceReservation_sellerId_idx" ON "MarketplaceReservation"("sellerId");
CREATE INDEX IF NOT EXISTS "MarketplaceReservation_status_idx" ON "MarketplaceReservation"("status");
CREATE INDEX IF NOT EXISTS "MarketplaceReservation_expiresAt_idx" ON "MarketplaceReservation"("expiresAt");
CREATE INDEX IF NOT EXISTS "MarketplaceTransaction_buyerId_idx" ON "MarketplaceTransaction"("buyerId");
CREATE INDEX IF NOT EXISTS "MarketplaceTransaction_sellerId_idx" ON "MarketplaceTransaction"("sellerId");
CREATE INDEX IF NOT EXISTS "MarketplaceTransaction_cardId_idx" ON "MarketplaceTransaction"("cardId");
CREATE INDEX IF NOT EXISTS "MarketplaceTransaction_status_idx" ON "MarketplaceTransaction"("status");
CREATE INDEX IF NOT EXISTS "MarketplaceTransaction_completedAt_idx" ON "MarketplaceTransaction"("completedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceReview_transactionId_reviewerId_key" ON "MarketplaceReview"("transactionId", "reviewerId");
CREATE INDEX IF NOT EXISTS "MarketplaceReview_revieweeId_idx" ON "MarketplaceReview"("revieweeId");
CREATE INDEX IF NOT EXISTS "MarketplaceReview_reviewerId_idx" ON "MarketplaceReview"("reviewerId");
CREATE INDEX IF NOT EXISTS "MarketplaceReview_status_idx" ON "MarketplaceReview"("status");
CREATE INDEX IF NOT EXISTS "MarketplaceReview_moderationStatus_idx" ON "MarketplaceReview"("moderationStatus");
CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceReviewTag_reviewId_tag_key" ON "MarketplaceReviewTag"("reviewId", "tag");
CREATE INDEX IF NOT EXISTS "MarketplaceReviewTag_tag_idx" ON "MarketplaceReviewTag"("tag");
CREATE INDEX IF NOT EXISTS "MarketplaceReport_reporterId_idx" ON "MarketplaceReport"("reporterId");
CREATE INDEX IF NOT EXISTS "MarketplaceReport_targetType_targetId_idx" ON "MarketplaceReport"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "MarketplaceReport_status_idx" ON "MarketplaceReport"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");
CREATE INDEX IF NOT EXISTS "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");

DO $$ BEGIN
  ALTER TABLE "MarketplaceReservation" ADD CONSTRAINT "MarketplaceReservation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ExtraForSaleListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MarketplaceTransaction" ADD CONSTRAINT "MarketplaceTransaction_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "MarketplaceReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MarketplaceTransaction" ADD CONSTRAINT "MarketplaceTransaction_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ExtraForSaleListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MarketplaceTransaction" ADD CONSTRAINT "MarketplaceTransaction_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MarketplaceTransaction" ADD CONSTRAINT "MarketplaceTransaction_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MarketplaceTransaction" ADD CONSTRAINT "MarketplaceTransaction_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "MarketplaceTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_revieweeId_fkey" FOREIGN KEY ("revieweeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MarketplaceReviewTag" ADD CONSTRAINT "MarketplaceReviewTag_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "MarketplaceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MarketplaceReport" ADD CONSTRAINT "MarketplaceReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MarketplaceTransaction" ADD CONSTRAINT "MarketplaceTransaction_quantity_check" CHECK ("quantity" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MarketplaceReservation" ADD CONSTRAINT "MarketplaceReservation_quantity_check" CHECK ("quantity" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
