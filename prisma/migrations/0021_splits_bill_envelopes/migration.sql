-- Envelopes whose categories are paid through the plan's bills (skipped by the
-- envelopes, since step 1 already counts them), and transaction splits: one
-- charge shared among categories, as an Amazon order is from its items.

ALTER TYPE "EnvelopeTier" ADD VALUE IF NOT EXISTS 'BILLS';

CREATE TABLE "TransactionSplit" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "categoryId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'amazon',
    "importId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionSplit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TransactionSplit_transactionId_idx" ON "TransactionSplit"("transactionId");
CREATE INDEX "TransactionSplit_importId_idx" ON "TransactionSplit"("importId");
ALTER TABLE "TransactionSplit" ADD CONSTRAINT "TransactionSplit_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransactionSplit" ADD CONSTRAINT "TransactionSplit_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
