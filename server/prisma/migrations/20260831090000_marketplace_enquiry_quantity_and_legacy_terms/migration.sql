-- Buyer enquiry quantity is explicit and required. Existing rows are backfilled
-- from reservations/latest offers where possible, with 1 as legacy fallback.
ALTER TABLE "MarketplaceEnquiry" ADD COLUMN IF NOT EXISTS "quantity" INTEGER;

UPDATE "MarketplaceEnquiry" AS enquiry
SET "quantity" = COALESCE(
  reservation."quantity",
  latest_offer."quantity",
  1
)
FROM "MarketplaceEnquiry" AS source
LEFT JOIN "MarketplaceReservation" AS reservation ON reservation."enquiryId" = source."id"
LEFT JOIN LATERAL (
  SELECT offer."quantity"
  FROM "EnquiryOffer" AS offer
  WHERE offer."enquiryId" = source."id"
  ORDER BY offer."createdAt" DESC
  LIMIT 1
) AS latest_offer ON TRUE
WHERE enquiry."id" = source."id" AND enquiry."quantity" IS NULL;

ALTER TABLE "MarketplaceEnquiry" ALTER COLUMN "quantity" SET NOT NULL;

-- V1 no longer treats logistics as structured negotiation fields. Keep the
-- legacy columns for existing production data, but allow new offers/reservations
-- to omit them and hide them from the API/UI contract.
ALTER TABLE "EnquiryOffer" ALTER COLUMN "fulfilmentMethod" DROP NOT NULL;
ALTER TABLE "MarketplaceReservation" ALTER COLUMN "fulfilmentMethod" DROP NOT NULL;
