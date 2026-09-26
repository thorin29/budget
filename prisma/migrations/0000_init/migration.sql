-- Initial schema.
--
-- Hand-written to match prisma/schema.prisma exactly. Prisma's own generator
-- could not run in the environment this was authored in, so if `prisma migrate
-- deploy` reports drift on a fresh database, regenerate with:
--   npx prisma migrate dev --name init
-- after deleting this directory.

-- ---------------------------------------------------------------- enums

CREATE TYPE "AccountKind" AS ENUM ('BANK', 'CREDIT_CARD', 'CASH', 'OTHER');

CREATE TYPE "LineItemKind" AS ENUM ('BILL', 'SETTLEMENT', 'INCOME');

CREATE TYPE "ScheduleKind" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'CUSTOM', 'ONE_OFF');

CREATE TYPE "PayFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'SEMI_MONTHLY', 'MONTHLY');

CREATE TYPE "PeriodAssignment" AS ENUM ('AUTO', 'FIRST', 'SECOND', 'THIRD', 'LAST');

-- ---------------------------------------------------------------- Account

CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "settledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Account_name_key" ON "Account"("name");
CREATE INDEX "Account_active_sortOrder_idx" ON "Account"("active", "sortOrder");

ALTER TABLE "Account"
    ADD CONSTRAINT "Account_settledById_fkey"
    FOREIGN KEY ("settledById") REFERENCES "Account"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------- Category

CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- ---------------------------------------------------------------- LineItem

CREATE TABLE "LineItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "LineItemKind" NOT NULL,
    "categoryId" TEXT,
    "paidFromId" TEXT,
    "chargedToId" TEXT,
    "plannedAmount" DECIMAL(12,2) NOT NULL,
    "dueDay" INTEGER,
    "periodAssignment" "PeriodAssignment" NOT NULL DEFAULT 'AUTO',
    "scheduleKind" "ScheduleKind" NOT NULL DEFAULT 'MONTHLY',
    "months" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]::INTEGER[],
    "onlyYear" INTEGER,
    "startYear" INTEGER,
    "startMonth" INTEGER,
    "endYear" INTEGER,
    "endMonth" INTEGER,
    "paymentUrl" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LineItem_active_kind_sortOrder_idx" ON "LineItem"("active", "kind", "sortOrder");
CREATE INDEX "LineItem_paidFromId_idx" ON "LineItem"("paidFromId");

ALTER TABLE "LineItem"
    ADD CONSTRAINT "LineItem_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LineItem"
    ADD CONSTRAINT "LineItem_paidFromId_fkey"
    FOREIGN KEY ("paidFromId") REFERENCES "Account"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LineItem"
    ADD CONSTRAINT "LineItem_chargedToId_fkey"
    FOREIGN KEY ("chargedToId") REFERENCES "Account"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------- MonthlyPlan

CREATE TABLE "MonthlyPlan" (
    "id" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(12,2),
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthlyPlan_lineItemId_year_month_key" ON "MonthlyPlan"("lineItemId", "year", "month");
CREATE INDEX "MonthlyPlan_year_month_idx" ON "MonthlyPlan"("year", "month");

ALTER TABLE "MonthlyPlan"
    ADD CONSTRAINT "MonthlyPlan_lineItemId_fkey"
    FOREIGN KEY ("lineItemId") REFERENCES "LineItem"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------- ActualEntry

CREATE TABLE "ActualEntry" (
    "id" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidOn" DATE,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "importBatch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActualEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActualEntry_lineItemId_year_month_key" ON "ActualEntry"("lineItemId", "year", "month");
CREATE INDEX "ActualEntry_year_month_idx" ON "ActualEntry"("year", "month");
CREATE INDEX "ActualEntry_importBatch_idx" ON "ActualEntry"("importBatch");

ALTER TABLE "ActualEntry"
    ADD CONSTRAINT "ActualEntry_lineItemId_fkey"
    FOREIGN KEY ("lineItemId") REFERENCES "LineItem"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------- BalanceSnapshot

CREATE TABLE "BalanceSnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BalanceSnapshot_accountId_year_month_key" ON "BalanceSnapshot"("accountId", "year", "month");
CREATE INDEX "BalanceSnapshot_year_month_idx" ON "BalanceSnapshot"("year", "month");

ALTER TABLE "BalanceSnapshot"
    ADD CONSTRAINT "BalanceSnapshot_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------- PaySchedule

CREATE TABLE "PaySchedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "frequency" "PayFrequency" NOT NULL DEFAULT 'BIWEEKLY',
    "anchorDate" DATE,
    "daysOfMonth" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "activeFrom" DATE NOT NULL,
    "activeTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaySchedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaySchedule_activeFrom_idx" ON "PaySchedule"("activeFrom");

-- ---------------------------------------------------------------- PayDateOverride

CREATE TABLE "PayDateOverride" (
    "id" TEXT NOT NULL,
    "payScheduleId" TEXT NOT NULL,
    "originalDate" DATE,
    "actualDate" DATE NOT NULL,
    "suppressed" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "PayDateOverride_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayDateOverride_actualDate_idx" ON "PayDateOverride"("actualDate");

ALTER TABLE "PayDateOverride"
    ADD CONSTRAINT "PayDateOverride_payScheduleId_fkey"
    FOREIGN KEY ("payScheduleId") REFERENCES "PaySchedule"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------- Setting

CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- ---------------------------------------------------------------- ImportBatch

CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "revertedAt" TIMESTAMP(3),
    "summary" JSONB,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);
