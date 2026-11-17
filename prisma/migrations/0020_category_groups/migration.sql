-- Spending envelopes: categories sit inside groups, and a group is an envelope
-- with a tier (essential, planned, flexible), an optional limit per pay period,
-- and optionally a balance that carries (a save-up).

CREATE TYPE "EnvelopeTier" AS ENUM ('ESSENTIAL', 'PLANNED', 'FLEXIBLE');

CREATE TABLE "CategoryGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" "EnvelopeTier" NOT NULL DEFAULT 'FLEXIBLE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "limitCents" INTEGER,
    "saveUp" BOOLEAN NOT NULL DEFAULT false,
    "saveUpTargetCents" INTEGER,
    "saveUpSince" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CategoryGroup_name_key" ON "CategoryGroup"("name");

ALTER TABLE "Category" ADD COLUMN "groupId" TEXT;
ALTER TABLE "Category" ADD CONSTRAINT "Category_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CategoryGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Category_groupId_idx" ON "Category"("groupId");
