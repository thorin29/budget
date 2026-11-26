-- Payments back tied to the charges someone owes you for.
CREATE TABLE "OwedLink" (
    "id" TEXT NOT NULL,
    "paybackId" TEXT NOT NULL,
    "chargeKey" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OwedLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OwedLink_paybackId_idx" ON "OwedLink"("paybackId");
CREATE INDEX "OwedLink_chargeKey_idx" ON "OwedLink"("chargeKey");

ALTER TABLE "OwedLink" ADD CONSTRAINT "OwedLink_paybackId_fkey" FOREIGN KEY ("paybackId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
