-- Add optional public user profile data for shared collections.
CREATE TABLE IF NOT EXISTS "UserProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "displayName" TEXT,
  "profileImageUrl" TEXT,
  "profileImageObjectKey" TEXT,
  "countryOfResidence" TEXT,
  "instagram" TEXT,
  "instagramVisible" BOOLEAN NOT NULL DEFAULT false,
  "telegram" TEXT,
  "telegramVisible" BOOLEAN NOT NULL DEFAULT false,
  "facebook" TEXT,
  "facebookVisible" BOOLEAN NOT NULL DEFAULT false,
  "email" TEXT,
  "emailVisible" BOOLEAN NOT NULL DEFAULT false,
  "phoneNumber" TEXT,
  "phoneNumberVisible" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserProfile_userId_key" ON "UserProfile"("userId");
CREATE INDEX IF NOT EXISTS "UserProfile_userId_idx" ON "UserProfile"("userId");

ALTER TABLE "UserProfile"
  ADD CONSTRAINT "UserProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "UserReference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "contactInfo" TEXT,
  "visible" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserReference_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserReference_userId_idx" ON "UserReference"("userId");

ALTER TABLE "UserReference"
  ADD CONSTRAINT "UserReference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
