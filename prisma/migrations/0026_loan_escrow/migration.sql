-- A loan payment can include escrow (taxes, insurance); the payoff leaves that part out.
ALTER TABLE "LineItem" ADD COLUMN IF NOT EXISTS "payoffEscrowCents" INTEGER;
