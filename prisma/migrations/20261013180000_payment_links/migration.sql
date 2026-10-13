-- Payment links + a second (non-GST) Razorpay account.
--
-- Additive only: three nullable columns on app_setting for the second account, one
-- more for the tenant's standing payment-page description, a nullable column on
-- payment recording WHICH account took the money, and a new payment_link table.
-- Nothing becomes required, so every existing row stays valid and the live funnel is
-- untouched (it keeps reading the original razorpayKeyId/Secret columns).
--
-- NOTE the table names: the Prisma models are AppSetting / Payment / PaymentLink,
-- the TABLES are app_setting / payment / payment_link (the models carry @@map).
-- IF NOT EXISTS throughout so this stays re-runnable - migrate deploy runs inside
-- the start command, and a half-applied migration there means the container never
-- starts.

ALTER TABLE "app_setting" ADD COLUMN IF NOT EXISTS "razorpayNonGstKeyId" TEXT;
ALTER TABLE "app_setting" ADD COLUMN IF NOT EXISTS "razorpayNonGstKeySecretEnc" TEXT;
ALTER TABLE "app_setting" ADD COLUMN IF NOT EXISTS "razorpayNonGstWebhookSecretEnc" TEXT;
ALTER TABLE "app_setting" ADD COLUMN IF NOT EXISTS "paymentLinkDescription" TEXT;

ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "providerAccount" TEXT;

-- CREATE TYPE has no IF NOT EXISTS; swallow the duplicate so a re-run is a no-op.
DO $$ BEGIN
  CREATE TYPE "PaymentLinkStatus" AS ENUM ('CREATED', 'PAID', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "payment_link" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "tenantId" TEXT,
  "submissionId" TEXT NOT NULL,
  "assessmentId" TEXT,
  "account" TEXT NOT NULL DEFAULT 'GST',
  "amountPaise" INTEGER NOT NULL,
  "minPaise" INTEGER NOT NULL DEFAULT 100,
  "description" TEXT,
  "status" "PaymentLinkStatus" NOT NULL DEFAULT 'CREATED',
  "providerOrderId" TEXT,
  "providerPaymentId" TEXT,
  "paidPaise" INTEGER,
  "paidAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_link_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_link_token_key" ON "payment_link"("token");
CREATE INDEX IF NOT EXISTS "payment_link_submissionId_idx" ON "payment_link"("submissionId");
CREATE INDEX IF NOT EXISTS "payment_link_tenantId_createdAt_idx" ON "payment_link"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "payment_link_status_idx" ON "payment_link"("status");

DO $$ BEGIN
  ALTER TABLE "payment_link"
    ADD CONSTRAINT "payment_link_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
