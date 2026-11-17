-- A bill can pay off a balance (a loan, an orthodontist) and end on its own when it reaches zero.

ALTER TABLE "LineItem" ADD COLUMN "payoffBalance" DECIMAL(12,2);
ALTER TABLE "LineItem" ADD COLUMN "payoffAsOf" DATE;
ALTER TABLE "LineItem" ADD COLUMN "payoffAccountId" TEXT;
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_payoffAccountId_fkey" FOREIGN KEY ("payoffAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
