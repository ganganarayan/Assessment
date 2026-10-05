-- External-gateway payment return, plus the two switches that govern whether any
-- respondent payment is offered at all.
--
-- Every column added here is defaulted or nullable, so nothing in flight changes:
-- the switches default TRUE (current behaviour), and an assessment with no
-- paymentReturnParam behaves exactly as it does today.

-- The per-tenant switch (owner-controlled) and the platform master (singleton row).
ALTER TABLE "tenant" ADD COLUMN "paymentsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "app_setting" ADD COLUMN "paymentsEnabledGlobal" BOOLEAN NOT NULL DEFAULT true;

-- The optional reference parameter a gateway appends to its success URL.
ALTER TABLE "assessment" ADD COLUMN "paymentReturnParam" TEXT;

-- The return ticket. One row per hand-off to an external payment link; matched on the
-- way back by the nonce in an httpOnly cookie, or by email when that cookie is lost.
CREATE TYPE "PaymentHandoffStatus" AS ENUM ('PENDING', 'CONSUMED');

CREATE TABLE "payment_handoff" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "status" "PaymentHandoffStatus" NOT NULL DEFAULT 'PENDING',
    "email" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "payment_handoff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_handoff_nonce_key" ON "payment_handoff"("nonce");
CREATE INDEX "payment_handoff_tenantId_email_status_idx" ON "payment_handoff"("tenantId", "email", "status");
CREATE INDEX "payment_handoff_submissionId_idx" ON "payment_handoff"("submissionId");
CREATE INDEX "payment_handoff_expiresAt_idx" ON "payment_handoff"("expiresAt");

ALTER TABLE "payment_handoff" ADD CONSTRAINT "payment_handoff_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
