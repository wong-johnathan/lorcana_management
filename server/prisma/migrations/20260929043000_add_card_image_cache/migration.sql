-- Store app-managed MinIO/S3 copies of Lorcana card artwork while keeping Card.imageUrl as the original fallback source.
ALTER TABLE "Card"
  ADD COLUMN "imageObjectKey" TEXT,
  ADD COLUMN "imageCachedAt" TIMESTAMP(3),
  ADD COLUMN "imageContentType" TEXT;

CREATE INDEX "Card_imageObjectKey_idx" ON "Card"("imageObjectKey");
