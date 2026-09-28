-- Prune future/dormant Marketplace V1 scaffolding and unused auth/FX tables.
-- Core card, inventory, extras, enquiries, reservations, notifications, pricing, and profile tables remain intact.

DROP TABLE IF EXISTS "MarketplaceReviewTag" CASCADE;
DROP TABLE IF EXISTS "MarketplaceReview" CASCADE;
DROP TABLE IF EXISTS "MarketplaceReport" CASCADE;
DROP TABLE IF EXISTS "MarketplaceTransaction" CASCADE;
DROP TABLE IF EXISTS "UserBlock" CASCADE;
DROP TABLE IF EXISTS "FxRate" CASCADE;
DROP TABLE IF EXISTS "ListingDestinationCountry" CASCADE;
DROP TABLE IF EXISTS "EmailVerificationToken" CASCADE;
DROP TABLE IF EXISTS "PasswordResetToken" CASCADE;

ALTER TABLE "ExtraForSaleListing"
  DROP COLUMN IF EXISTS "marketplaceVisible",
  DROP COLUMN IF EXISTS "askingPriceMinor",
  DROP COLUMN IF EXISTS "currency",
  DROP COLUMN IF EXISTS "condition",
  DROP COLUMN IF EXISTS "cardLanguage",
  DROP COLUMN IF EXISTS "originCountryCode",
  DROP COLUMN IF EXISTS "publicLocality",
  DROP COLUMN IF EXISTS "allowsMeetup",
  DROP COLUMN IF EXISTS "shipsDomestically",
  DROP COLUMN IF EXISTS "shipsInternationally",
  DROP COLUMN IF EXISTS "shipsWorldwide";

ALTER TABLE "EnquiryOffer"
  DROP COLUMN IF EXISTS "shippingPriceMinor",
  DROP COLUMN IF EXISTS "fulfilmentMethod",
  DROP COLUMN IF EXISTS "buyerCountryCode";

ALTER TABLE "MarketplaceReservation"
  DROP COLUMN IF EXISTS "shippingPriceMinor",
  DROP COLUMN IF EXISTS "fulfilmentMethod",
  DROP COLUMN IF EXISTS "buyerCountryCode";
