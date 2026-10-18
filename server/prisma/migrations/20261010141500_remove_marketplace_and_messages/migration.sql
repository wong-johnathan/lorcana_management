-- Remove marketplace, enquiry/messaging, notifications, extras-for-sale and
-- trade-reference features. Lorcana management keeps the card database, inventory,
-- price tracking, AI analysis, and outbound links to TCGplayer/CardTrader/eBay.
--
-- IRREVERSIBLE: take a pg_dump of these tables before applying.
--   ExtraForSaleListing, MarketplaceEnquiry, EnquiryMessage, EnquiryOffer,
--   MarketplaceReservation, Notification, UserReference
-- Also drops UserInventoryPolicy.autoSuggestExtras, which only configured the
-- removed extras-suggestion engine.

-- DropForeignKey
ALTER TABLE "ExtraForSaleListing" DROP CONSTRAINT "ExtraForSaleListing_userId_fkey";
-- DropForeignKey
ALTER TABLE "ExtraForSaleListing" DROP CONSTRAINT "ExtraForSaleListing_cardId_fkey";
-- DropForeignKey
ALTER TABLE "MarketplaceEnquiry" DROP CONSTRAINT "MarketplaceEnquiry_listingId_fkey";
-- DropForeignKey
ALTER TABLE "MarketplaceEnquiry" DROP CONSTRAINT "MarketplaceEnquiry_buyerId_fkey";
-- DropForeignKey
ALTER TABLE "EnquiryMessage" DROP CONSTRAINT "EnquiryMessage_enquiryId_fkey";
-- DropForeignKey
ALTER TABLE "EnquiryMessage" DROP CONSTRAINT "EnquiryMessage_senderId_fkey";
-- DropForeignKey
ALTER TABLE "EnquiryOffer" DROP CONSTRAINT "EnquiryOffer_enquiryId_fkey";
-- DropForeignKey
ALTER TABLE "EnquiryOffer" DROP CONSTRAINT "EnquiryOffer_proposedByUserId_fkey";
-- DropForeignKey
ALTER TABLE "MarketplaceReservation" DROP CONSTRAINT "MarketplaceReservation_listingId_fkey";
-- DropForeignKey
ALTER TABLE "MarketplaceReservation" DROP CONSTRAINT "MarketplaceReservation_enquiryId_fkey";
-- DropForeignKey
ALTER TABLE "MarketplaceReservation" DROP CONSTRAINT "MarketplaceReservation_acceptedOfferId_fkey";
-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_userId_fkey";
-- DropForeignKey
ALTER TABLE "UserReference" DROP CONSTRAINT "UserReference_userId_fkey";
-- AlterTable
ALTER TABLE "UserInventoryPolicy" DROP COLUMN "autoSuggestExtras";
-- DropTable
DROP TABLE "ExtraForSaleListing";
-- DropTable
DROP TABLE "MarketplaceEnquiry";
-- DropTable
DROP TABLE "EnquiryMessage";
-- DropTable
DROP TABLE "EnquiryOffer";
-- DropTable
DROP TABLE "MarketplaceReservation";
-- DropTable
DROP TABLE "Notification";
-- DropTable
DROP TABLE "UserReference";
