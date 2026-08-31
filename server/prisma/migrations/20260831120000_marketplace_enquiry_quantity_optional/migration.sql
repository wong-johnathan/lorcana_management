-- Chat-first enquiries no longer require a quantity up front. Buyers tap
-- "Chat", the thread opens, and quantity is negotiated in chat (via offers
-- or a seller-side accept). Existing rows keep their backfilled quantity.
ALTER TABLE "MarketplaceEnquiry" ALTER COLUMN "quantity" DROP NOT NULL;
