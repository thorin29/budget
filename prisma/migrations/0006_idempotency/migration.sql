-- Phone writes carry an Idempotency-Key; the first answer is kept so a retried
-- offline write is never applied twice. Rows older than 30 days are pruned.

CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdempotencyRecord_deviceId_key_key" ON "IdempotencyRecord"("deviceId", "key");
CREATE INDEX "IdempotencyRecord_createdAt_idx" ON "IdempotencyRecord"("createdAt");

ALTER TABLE "IdempotencyRecord"
    ADD CONSTRAINT "IdempotencyRecord_deviceId_fkey" FOREIGN KEY ("deviceId")
    REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
