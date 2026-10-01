-- Mark a line item as paid from whatever is left after the bills.
--
-- A revolving card whose payment is decided by what remains should not compete
-- with fixed bills for cash. Flagged items are excluded from each half's
-- remaining, from the transfer figures, and from the projection's obligations,
-- so the projection reports how much is available to send them.
--
-- Defaults to false, so existing installations behave exactly as before.

ALTER TABLE "LineItem"
    ADD COLUMN "paidFromSurplus" BOOLEAN NOT NULL DEFAULT false;
