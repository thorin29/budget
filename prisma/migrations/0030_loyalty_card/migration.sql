-- Store loyalty cards the household shares.
CREATE TABLE "LoyaltyCard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'CODE_128',
    "color" TEXT NOT NULL DEFAULT '#334155',
    "memberName" TEXT,
    "image" BYTEA,
    "imageType" TEXT,
    "imageVersion" INTEGER NOT NULL DEFAULT 0,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltyCard_pkey" PRIMARY KEY ("id")
);
