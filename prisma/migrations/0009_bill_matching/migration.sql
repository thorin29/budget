-- Bank transactions suggest which bill they paid. A confirmed payment links to
-- its transaction, and the merchant (as a keyed hash) is remembered for that
-- bill. Turned-down suggestions are kept so they aren't offered again.

ALTER TABLE "ActualEntry" ADD COLUMN "bankTransactionId" TEXT;
CREATE UNIQUE INDEX "ActualEntry_bankTransactionId_key" ON "ActualEntry"("bankTransactionId");
ALTER TABLE "ActualEntry"
    ADD CONSTRAINT "ActualEntry_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId")
    REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "BillRule" (
    "id" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BillRule_lineItemId_merchantKey_key" ON "BillRule"("lineItemId", "merchantKey");
CREATE INDEX "BillRule_merchantKey_idx" ON "BillRule"("merchantKey");
ALTER TABLE "BillRule"
    ADD CONSTRAINT "BillRule_lineItemId_fkey" FOREIGN KEY ("lineItemId")
    REFERENCES "LineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ReviewDismissal" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewDismissal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReviewDismissal_kind_key_key" ON "ReviewDismissal"("kind", "key");
