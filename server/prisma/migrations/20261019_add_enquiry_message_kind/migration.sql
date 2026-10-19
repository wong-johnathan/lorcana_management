-- Additive migration: tag enquiry messages as USER vs SYSTEM so the thread can
-- render inline system events (mark-sold, buyer-confirm) without a new table.
-- Default 'USER' preserves every existing message. No backfill needed.

ALTER TABLE "EnquiryMessage" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'USER';
