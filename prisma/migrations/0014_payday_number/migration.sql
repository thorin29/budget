-- Income can follow the pay calendar: a "2nd paycheck" or "3rd paycheck" item
-- arrives on that payday of the month, and only in months that have it.

ALTER TABLE "LineItem" ADD COLUMN "paydayNumber" INTEGER;
