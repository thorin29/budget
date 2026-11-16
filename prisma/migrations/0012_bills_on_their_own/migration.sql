-- Bills that take care of themselves: an exact, known match is recorded on its
-- own (per item, on by default), and the due day follows when the bank shows
-- it posting unless the person set it.

ALTER TABLE "LineItem" ADD COLUMN "autoRecord" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LineItem" ADD COLUMN "dueDayLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LineItem" ADD COLUMN "dueDayPrevious" INTEGER;
ALTER TABLE "LineItem" ADD COLUMN "dueDayChangedAt" TIMESTAMP(3);
