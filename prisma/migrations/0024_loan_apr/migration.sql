-- A loan bill can carry its interest rate, so its payoff date counts interest.
ALTER TABLE "LineItem" ADD COLUMN IF NOT EXISTS "payoffAprBps" INTEGER;
