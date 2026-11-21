-- Device scope: "full" (phones) or "amazon" (the Amazon extension, limited to /api/v1/amazon).
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'full';

-- The Amazon extension's last run (one row, id "default"): how it went and two counts, nothing from Amazon.
CREATE TABLE IF NOT EXISTS "AmazonSync" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "failedSection" TEXT,
    "extensionVersion" TEXT,
    "chargesSplit" INTEGER NOT NULL DEFAULT 0,
    "ordersWaiting" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AmazonSync_pkey" PRIMARY KEY ("id")
);
