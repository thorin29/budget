-- Let an income line item arrive on a pay calendar.
--
-- Without this, income can only be described as a single monthly amount on a
-- given day, which cannot express a fortnightly wage — and in particular cannot
-- express a month containing three paydays. With it, the projection places one
-- payment on every payday the schedule generates.

ALTER TABLE "LineItem" ADD COLUMN "payScheduleId" TEXT;

CREATE INDEX "LineItem_payScheduleId_idx" ON "LineItem"("payScheduleId");

ALTER TABLE "LineItem"
    ADD CONSTRAINT "LineItem_payScheduleId_fkey"
    FOREIGN KEY ("payScheduleId") REFERENCES "PaySchedule"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
