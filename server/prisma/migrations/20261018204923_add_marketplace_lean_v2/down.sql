-- Rollback for 20261018204923_add_marketplace_lean_v2.
-- Drops the 8 marketplace tables in reverse dependency order (children before
-- parents) and removes the two columns added to "User". Additive-only reversal:
-- no destructive/irreversible statements beyond the documented reverse of the
-- forward migration, and no data backfill in either direction.

DROP TABLE IF EXISTS "MarketplaceReview";
DROP TABLE IF EXISTS "EnquiryMessage";
DROP TABLE IF EXISTS "MarketplaceTransaction";
DROP TABLE IF EXISTS "MarketplaceEnquiry";
DROP TABLE IF EXISTS "MarketplaceListingPhoto";
DROP TABLE IF EXISTS "MarketplaceReport";
DROP TABLE IF EXISTS "UserReference";
DROP TABLE IF EXISTS "MarketplaceListing";

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "isOperator",
  DROP COLUMN IF EXISTS "disabledAt";
