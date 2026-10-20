-- The billing record the app owns, and the AI spend it can be measured against.
--
-- WHY THESE COLUMNS. currentPeriodStart/End are only ever written by the Razorpay
-- webhook, so a subscription activated by the browser returning from Checkout has
-- neither, and the app could not say when it renews. These three are written by the
-- app itself from the confirmation it already receives, so the answer never depends
-- on a webhook arriving.
ALTER TABLE "subscription" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "subscription" ADD COLUMN "renewsAt" TIMESTAMP(3);
ALTER TABLE "subscription" ADD COLUMN "lastPaymentId" TEXT;

-- AI spend per call. costMicroUsd is an integer (USD x 1,000,000) because a single
-- call frequently costs a fraction of a cent, and float money summed over thousands
-- of rows drifts away from the real bill.
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" TEXT,
    "onPlatformKey" BOOLEAN NOT NULL DEFAULT true,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_usage_tenantId_createdAt_idx" ON "ai_usage"("tenantId", "createdAt");
CREATE INDEX "ai_usage_createdAt_idx" ON "ai_usage"("createdAt");

ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
