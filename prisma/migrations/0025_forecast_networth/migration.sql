-- Checking's forecast as it stood each day, to check it against what happened.
CREATE TABLE IF NOT EXISTS "ForecastPoint" (
    "takenOn" DATE NOT NULL,
    "forDate" DATE NOT NULL,
    "bestCents" INTEGER NOT NULL,
    "worstCents" INTEGER NOT NULL,
    CONSTRAINT "ForecastPoint_pkey" PRIMARY KEY ("takenOn", "forDate")
);
CREATE INDEX IF NOT EXISTS "ForecastPoint_forDate_idx" ON "ForecastPoint"("forDate");

-- Net worth at the end of each month.
CREATE TABLE IF NOT EXISTS "NetWorthSnapshot" (
    "month" TEXT NOT NULL,
    "ownCents" BIGINT NOT NULL,
    "oweCents" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NetWorthSnapshot_pkey" PRIMARY KEY ("month")
);
