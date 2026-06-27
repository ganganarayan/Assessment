-- Razorpay payments: per-assessment price + a forward-compatible payments table
-- (assessment_unlock now; subscription/plan later).
ALTER TABLE "assessment" ADD COLUMN "paymentAmount" INTEGER;

CREATE TABLE "payment" (
  "id"                TEXT NOT NULL,
  "provider"          TEXT NOT NULL DEFAULT 'razorpay',
  "providerPaymentId" TEXT,
  "providerOrderId"   TEXT,
  "providerLinkId"    TEXT,
  "purpose"           TEXT NOT NULL,
  "plan"              TEXT,
  "submissionId"      TEXT,
  "amount"            INTEGER,
  "currency"          TEXT NOT NULL DEFAULT 'INR',
  "status"            TEXT NOT NULL,
  "method"            TEXT,
  "event"             TEXT,
  "notes"             JSONB,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_providerPaymentId_key" ON "payment"("providerPaymentId");
CREATE INDEX "payment_submissionId_idx" ON "payment"("submissionId");
CREATE INDEX "payment_purpose_idx" ON "payment"("purpose");
