-- Accounts set themselves up: a type guessed from the name replaces the
-- Spending / Balance only / Hidden choice. Hidden is kept as its own flag.

CREATE TYPE "BankAccountType" AS ENUM ('CHECKING', 'SAVINGS', 'CREDIT_CARD', 'LOAN', 'MORTGAGE', 'INVESTMENT', 'RETIREMENT', 'CRYPTO', 'OTHER');

ALTER TABLE "BankAccount"
    ADD COLUMN "type" "BankAccountType" NOT NULL DEFAULT 'OTHER',
    ADD COLUMN "typeSource" TEXT NOT NULL DEFAULT 'guess',
    ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;

UPDATE "BankAccount" SET "hidden" = true WHERE "use" = 'HIDDEN';

ALTER TABLE "BankAccount" DROP COLUMN "use";
DROP TYPE "BankAccountUse";
