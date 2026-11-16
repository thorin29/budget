-- Bills point at bank feed accounts. Each feed account that bills can be paid
-- from gets an account behind it (origin "bank"); accounts typed by hand are
-- connected to their feed account when the match is clear.

ALTER TABLE "Account" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'manual';
