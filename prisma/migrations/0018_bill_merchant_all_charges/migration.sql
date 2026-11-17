-- A merchant can be marked as paying a bill with every charge, so none of its charges counts as spending.

ALTER TABLE "BillRule" ADD COLUMN "coversAll" BOOLEAN NOT NULL DEFAULT false;
