-- Rollback for 20261019_add_enquiry_message_kind.
ALTER TABLE "EnquiryMessage" DROP COLUMN IF EXISTS "kind";
