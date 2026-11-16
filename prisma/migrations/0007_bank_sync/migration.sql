-- Bank sync (SimpleFIN protocol): one encrypted connection, the accounts and
-- transactions it delivers, and CSV imports that can be undone. Optional; the
-- tables stay empty until a setup token is pasted in.

CREATE TYPE "BankAccountUse" AS ENUM ('SPENDING', 'BALANCE_ONLY', 'HIDDEN');
CREATE TYPE "BankTransactionKind" AS ENUM ('NORMAL', 'TRANSFER', 'IGNORED');

CREATE TABLE "BankConnection" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "accessUrlEnc" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "messages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "syncStartedAt" TIMESTAMP(3),

    CONSTRAINT "BankConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "institution" TEXT,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "balance" DECIMAL(14,2),
    "availableBalance" DECIMAL(14,2),
    "balanceDate" TIMESTAMP(3),
    "use" "BankAccountUse",
    "linkedAccountId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BankAccount_externalId_key" ON "BankAccount"("externalId");
CREATE UNIQUE INDEX "BankAccount_linkedAccountId_key" ON "BankAccount"("linkedAccountId");

ALTER TABLE "BankAccount"
    ADD CONSTRAINT "BankAccount_linkedAccountId_fkey" FOREIGN KEY ("linkedAccountId")
    REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "BankImport" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fileName" TEXT,
    "added" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revertedAt" TIMESTAMP(3),

    CONSTRAINT "BankImport_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BankImport"
    ADD CONSTRAINT "BankImport_accountId_fkey" FOREIGN KEY ("accountId")
    REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT,
    "postedOn" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "payee" TEXT,
    "memo" TEXT,
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "merchant" TEXT NOT NULL,
    "kind" "BankTransactionKind" NOT NULL DEFAULT 'NORMAL',
    "transferOfId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'sync',
    "importId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BankTransaction_accountId_externalId_key" ON "BankTransaction"("accountId", "externalId");
CREATE INDEX "BankTransaction_accountId_postedOn_idx" ON "BankTransaction"("accountId", "postedOn");
CREATE INDEX "BankTransaction_postedOn_idx" ON "BankTransaction"("postedOn");
CREATE INDEX "BankTransaction_importId_idx" ON "BankTransaction"("importId");

ALTER TABLE "BankTransaction"
    ADD CONSTRAINT "BankTransaction_accountId_fkey" FOREIGN KEY ("accountId")
    REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BankTransaction"
    ADD CONSTRAINT "BankTransaction_importId_fkey" FOREIGN KEY ("importId")
    REFERENCES "BankImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
