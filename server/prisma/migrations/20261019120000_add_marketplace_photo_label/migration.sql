-- Additive migration for photo position labels (REQ-POL-15).
-- Adds a single nullable `label` TEXT column to MarketplaceListingPhoto. No
-- data is backfilled: existing rows read NULL (unlabeled). Server validation
-- whitelist-normalizes any persisted value to the 10 positions or "Other",
-- so the column never holds arbitrary free text.
--
-- Generated offline via:
--   prisma migrate diff --from-schema-datamodel <base> --to-schema-datamodel prisma/schema.prisma --script

-- AlterTable
ALTER TABLE "MarketplaceListingPhoto" ADD COLUMN "label" TEXT;
