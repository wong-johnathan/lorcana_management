-- Additive migration: per-(enquiry, user) read state for unread notifications.
-- No backfill: absence of a row means "never read" (AC-NOTIF-3.5). Generated via:
--   prisma migrate diff --from-schema-datamodel <base> --to-schema-datamodel prisma/schema.prisma --script

CREATE TABLE "EnquiryReadState" (
    "id" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnquiryReadState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnquiryReadState_enquiryId_userId_key" ON "EnquiryReadState"("enquiryId", "userId");

CREATE INDEX "EnquiryReadState_userId_idx" ON "EnquiryReadState"("userId");

ALTER TABLE "EnquiryReadState" ADD CONSTRAINT "EnquiryReadState_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "MarketplaceEnquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnquiryReadState" ADD CONSTRAINT "EnquiryReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
