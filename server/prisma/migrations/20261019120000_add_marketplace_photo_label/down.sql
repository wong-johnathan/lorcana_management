-- Rollback for 20261019120000_add_marketplace_photo_label.
-- Drops the nullable label column added in the forward migration. Additive-only
-- reversal: no data is destroyed beyond the column itself (label is
-- non-essential metadata), and no backfill runs in either direction.

ALTER TABLE "MarketplaceListingPhoto" DROP COLUMN "label";
