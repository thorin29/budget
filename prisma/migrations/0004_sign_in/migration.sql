-- Sign-in: up to two equal users, one-time invite codes, and who recorded each
-- payment. The cookie-signing secret lives in "Setting" and is minted on first
-- use, so nothing here needs a value.
--
-- Existing data is untouched; recordedById stays null for everything entered
-- before this release.

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "credentialVersion" INTEGER NOT NULL DEFAULT 1,
    "lastSignInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

CREATE TABLE "InviteCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InviteCode_codeHash_key" ON "InviteCode"("codeHash");

ALTER TABLE "InviteCode"
    ADD CONSTRAINT "InviteCode_createdById_fkey" FOREIGN KEY ("createdById")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActualEntry" ADD COLUMN "recordedById" TEXT;

ALTER TABLE "ActualEntry"
    ADD CONSTRAINT "ActualEntry_recordedById_fkey" FOREIGN KEY ("recordedById")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
