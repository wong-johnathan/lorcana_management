-- Marketplace V1 backend foundation: account email verification,
-- explicit global publication fields, discovery/enquiry records,
-- reservations/transaction snapshots, notifications, and FX cache.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "emailNormalized" TEXT,
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_emailNormalized_key" ON "User"("emailNormalized");

ALTER TABLE "ExtraForSaleListing"
  ADD COLUMN IF NOT EXISTS "marketplaceVisible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "pricingMode" TEXT NOT NULL DEFAULT 'FIXED',
  ADD COLUMN IF NOT EXISTS "askingPriceMinor" INTEGER,
  ADD COLUMN IF NOT EXISTS "currency" TEXT,
  ADD COLUMN IF NOT EXISTS "condition" TEXT,
  ADD COLUMN IF NOT EXISTS "cardLanguage" TEXT,
  ADD COLUMN IF NOT EXISTS "originCountryCode" TEXT,
  ADD COLUMN IF NOT EXISTS "publicLocality" TEXT,
  ADD COLUMN IF NOT EXISTS "allowsMeetup" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "shipsDomestically" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "shipsInternationally" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "shipsWorldwide" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "ExtraForSaleListing_marketplaceVisible_status_idx" ON "ExtraForSaleListing"("marketplaceVisible", "status");
CREATE INDEX IF NOT EXISTS "ExtraForSaleListing_currency_idx" ON "ExtraForSaleListing"("currency");
CREATE INDEX IF NOT EXISTS "ExtraForSaleListing_condition_idx" ON "ExtraForSaleListing"("condition");
CREATE INDEX IF NOT EXISTS "ExtraForSaleListing_originCountryCode_idx" ON "ExtraForSaleListing"("originCountryCode");

CREATE TABLE IF NOT EXISTS "EmailVerificationToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");
ALTER TABLE "EmailVerificationToken"
  ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
ALTER TABLE "PasswordResetToken"
  ADD CONSTRAINT "PasswordResetToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ListingDestinationCountry" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ListingDestinationCountry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ListingDestinationCountry_listingId_countryCode_key" ON "ListingDestinationCountry"("listingId", "countryCode");
CREATE INDEX IF NOT EXISTS "ListingDestinationCountry_countryCode_idx" ON "ListingDestinationCountry"("countryCode");
ALTER TABLE "ListingDestinationCountry"
  ADD CONSTRAINT "ListingDestinationCountry_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "ExtraForSaleListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "MarketplaceEnquiry" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_SELLER',
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceEnquiry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MarketplaceEnquiry_listingId_idx" ON "MarketplaceEnquiry"("listingId");
CREATE INDEX IF NOT EXISTS "MarketplaceEnquiry_buyerId_idx" ON "MarketplaceEnquiry"("buyerId");
CREATE INDEX IF NOT EXISTS "MarketplaceEnquiry_status_idx" ON "MarketplaceEnquiry"("status");
CREATE INDEX IF NOT EXISTS "MarketplaceEnquiry_lastActivityAt_idx" ON "MarketplaceEnquiry"("lastActivityAt");
ALTER TABLE "MarketplaceEnquiry"
  ADD CONSTRAINT "MarketplaceEnquiry_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "ExtraForSaleListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceEnquiry"
  ADD CONSTRAINT "MarketplaceEnquiry_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "EnquiryMessage" (
  "id" TEXT NOT NULL,
  "enquiryId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnquiryMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EnquiryMessage_enquiryId_idx" ON "EnquiryMessage"("enquiryId");
CREATE INDEX IF NOT EXISTS "EnquiryMessage_senderId_idx" ON "EnquiryMessage"("senderId");
CREATE INDEX IF NOT EXISTS "EnquiryMessage_createdAt_idx" ON "EnquiryMessage"("createdAt");
ALTER TABLE "EnquiryMessage"
  ADD CONSTRAINT "EnquiryMessage_enquiryId_fkey"
  FOREIGN KEY ("enquiryId") REFERENCES "MarketplaceEnquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnquiryMessage"
  ADD CONSTRAINT "EnquiryMessage_senderId_fkey"
  FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "EnquiryOffer" (
  "id" TEXT NOT NULL,
  "enquiryId" TEXT NOT NULL,
  "proposedByUserId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPriceMinor" INTEGER NOT NULL,
  "shippingPriceMinor" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL,
  "fulfilmentMethod" TEXT NOT NULL,
  "buyerCountryCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnquiryOffer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EnquiryOffer_enquiryId_idx" ON "EnquiryOffer"("enquiryId");
CREATE INDEX IF NOT EXISTS "EnquiryOffer_proposedByUserId_idx" ON "EnquiryOffer"("proposedByUserId");
ALTER TABLE "EnquiryOffer"
  ADD CONSTRAINT "EnquiryOffer_enquiryId_fkey"
  FOREIGN KEY ("enquiryId") REFERENCES "MarketplaceEnquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnquiryOffer"
  ADD CONSTRAINT "EnquiryOffer_proposedByUserId_fkey"
  FOREIGN KEY ("proposedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "MarketplaceReservation" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "enquiryId" TEXT NOT NULL,
  "acceptedOfferId" TEXT,
  "quantity" INTEGER NOT NULL,
  "unitPriceMinor" INTEGER NOT NULL,
  "shippingPriceMinor" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL,
  "fulfilmentMethod" TEXT NOT NULL,
  "buyerCountryCode" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceReservation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceReservation_enquiryId_key" ON "MarketplaceReservation"("enquiryId");
CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceReservation_acceptedOfferId_key" ON "MarketplaceReservation"("acceptedOfferId");
CREATE INDEX IF NOT EXISTS "MarketplaceReservation_listingId_idx" ON "MarketplaceReservation"("listingId");
CREATE INDEX IF NOT EXISTS "MarketplaceReservation_status_idx" ON "MarketplaceReservation"("status");
CREATE INDEX IF NOT EXISTS "MarketplaceReservation_expiresAt_idx" ON "MarketplaceReservation"("expiresAt");
ALTER TABLE "MarketplaceReservation"
  ADD CONSTRAINT "MarketplaceReservation_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "ExtraForSaleListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceReservation"
  ADD CONSTRAINT "MarketplaceReservation_enquiryId_fkey"
  FOREIGN KEY ("enquiryId") REFERENCES "MarketplaceEnquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceReservation"
  ADD CONSTRAINT "MarketplaceReservation_acceptedOfferId_fkey"
  FOREIGN KEY ("acceptedOfferId") REFERENCES "EnquiryOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "MarketplaceTransaction" (
  "id" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "cardId" TEXT,
  "cardName" TEXT NOT NULL,
  "cardSubtitle" TEXT,
  "cardNumber" TEXT NOT NULL,
  "cardImageUrl" TEXT,
  "variant" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "agreedUnitPriceMinor" INTEGER NOT NULL,
  "agreedShippingPriceMinor" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL,
  "fulfilmentMethod" TEXT NOT NULL,
  "buyerCountryCode" TEXT,
  "status" TEXT NOT NULL DEFAULT 'AWAITING_BUYER_CONFIRMATION',
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceTransaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceTransaction_reservationId_key" ON "MarketplaceTransaction"("reservationId");
CREATE INDEX IF NOT EXISTS "MarketplaceTransaction_sellerId_idx" ON "MarketplaceTransaction"("sellerId");
CREATE INDEX IF NOT EXISTS "MarketplaceTransaction_buyerId_idx" ON "MarketplaceTransaction"("buyerId");
CREATE INDEX IF NOT EXISTS "MarketplaceTransaction_cardId_idx" ON "MarketplaceTransaction"("cardId");
CREATE INDEX IF NOT EXISTS "MarketplaceTransaction_status_idx" ON "MarketplaceTransaction"("status");
ALTER TABLE "MarketplaceTransaction"
  ADD CONSTRAINT "MarketplaceTransaction_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "MarketplaceReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceTransaction"
  ADD CONSTRAINT "MarketplaceTransaction_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceTransaction"
  ADD CONSTRAINT "MarketplaceTransaction_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceTransaction"
  ADD CONSTRAINT "MarketplaceTransaction_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "relatedType" TEXT,
  "relatedId" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX IF NOT EXISTS "Notification_readAt_idx" ON "Notification"("readAt");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "FxRate" (
  "id" TEXT NOT NULL,
  "baseCurrency" TEXT NOT NULL,
  "quoteCurrency" TEXT NOT NULL,
  "rate" DECIMAL(18,8) NOT NULL,
  "source" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FxRate_baseCurrency_quoteCurrency_source_key" ON "FxRate"("baseCurrency", "quoteCurrency", "source");
CREATE INDEX IF NOT EXISTS "FxRate_fetchedAt_idx" ON "FxRate"("fetchedAt");
