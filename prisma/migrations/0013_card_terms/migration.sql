-- Card payments: each card can carry its statement closing day, payment due
-- day and the end of a 0% offer, so the app can work out what's due and when.

ALTER TABLE "BankAccount" ADD COLUMN "statementCloseDay" INTEGER;
ALTER TABLE "BankAccount" ADD COLUMN "paymentDueDay" INTEGER;
ALTER TABLE "BankAccount" ADD COLUMN "promoEndsOn" DATE;
