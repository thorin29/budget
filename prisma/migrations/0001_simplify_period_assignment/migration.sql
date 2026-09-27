-- Reduce PeriodAssignment to the two halves the application actually models.
--
-- THIRD and LAST are remnants of an earlier design in which a month was divided
-- by its paydays and could hold three periods. The month is now split at a fixed
-- day, so only AUTO, FIRST and SECOND are meaningful. PostgreSQL cannot drop a
-- value from an enum, so the type is recreated.

-- Map any existing rows using the removed values onto the second half, which is
-- how the application already treated them.
UPDATE "LineItem"
SET "periodAssignment" = 'SECOND'
WHERE "periodAssignment" IN ('THIRD', 'LAST');

ALTER TYPE "PeriodAssignment" RENAME TO "PeriodAssignment_old";

CREATE TYPE "PeriodAssignment" AS ENUM ('AUTO', 'FIRST', 'SECOND');

ALTER TABLE "LineItem"
  ALTER COLUMN "periodAssignment" DROP DEFAULT,
  ALTER COLUMN "periodAssignment" TYPE "PeriodAssignment"
    USING ("periodAssignment"::text::"PeriodAssignment"),
  ALTER COLUMN "periodAssignment" SET DEFAULT 'AUTO';

DROP TYPE "PeriodAssignment_old";
