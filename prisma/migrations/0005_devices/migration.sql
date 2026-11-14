-- Phones: one row per enrolled device with the SHA-256 of its bearer token,
-- and one-time codes for adding a phone from the web. No existing data changes.

CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "credentialVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Device_tokenHash_key" ON "Device"("tokenHash");
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

ALTER TABLE "Device"
    ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EnrollCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnrollCode_codeHash_key" ON "EnrollCode"("codeHash");
CREATE UNIQUE INDEX "EnrollCode_userId_key" ON "EnrollCode"("userId");

ALTER TABLE "EnrollCode"
    ADD CONSTRAINT "EnrollCode_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
