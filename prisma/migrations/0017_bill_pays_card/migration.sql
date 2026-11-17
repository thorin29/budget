-- A card-payment bill can name the card it pays, so payments to that card are recorded for it.

ALTER TABLE "LineItem" ADD COLUMN "paysCardId" TEXT;
ALTER TABLE "LineItem" ADD COLUMN "paysCardLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_paysCardId_fkey" FOREIGN KEY ("paysCardId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "LineItem_paysCardId_idx" ON "LineItem"("paysCardId");
