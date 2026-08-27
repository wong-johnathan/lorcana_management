-- Marketplace V1 reviews/trust foundation layered on top of the marketplace backend foundation.
-- Adds blind reviews, reputation inputs, reports, and user blocking without creating a
-- second listing or transaction model.

ALTER TABLE "MarketplaceTransaction"
  ADD COLUMN IF NOT EXISTS "reviewWindowEndsAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "disputedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "MarketplaceTransaction_completedAt_idx" ON "MarketplaceTransaction"("completedAt");

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
