-- A keyed hash of each split's item, so a category fixed once applies to the same item everywhere.
ALTER TABLE "TransactionSplit" ADD COLUMN IF NOT EXISTS "itemKey" TEXT;
CREATE INDEX IF NOT EXISTS "TransactionSplit_itemKey_idx" ON "TransactionSplit"("itemKey");
