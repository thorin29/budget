-- Bank transactions get a category: guessed from the merchant, learned from
-- the person's corrections (merchant kept as a keyed hash), or taken from the
-- bill a payment was confirmed for. A category can be marked as money managed
-- for others, which keeps it out of spending and income.

ALTER TABLE "Category" ADD COLUMN "managedForOthers" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "BankTransaction" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "BankTransaction" ADD COLUMN "categorySource" TEXT NOT NULL DEFAULT 'guess';
CREATE INDEX "BankTransaction_categoryId_idx" ON "BankTransaction"("categoryId");
ALTER TABLE "BankTransaction"
    ADD CONSTRAINT "BankTransaction_categoryId_fkey" FOREIGN KEY ("categoryId")
    REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CategoryRule" (
    "id" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CategoryRule_merchantKey_key" ON "CategoryRule"("merchantKey");
ALTER TABLE "CategoryRule"
    ADD CONSTRAINT "CategoryRule_categoryId_fkey" FOREIGN KEY ("categoryId")
    REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
