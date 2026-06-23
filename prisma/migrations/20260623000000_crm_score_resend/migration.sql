-- CRM "score_updated" resend: dirty-tracking queue on submissions + the
-- destination endpoint and drip-active flag on the singleton settings.
ALTER TABLE "submission"
  ADD COLUMN "crmDirty" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "crmSentAt" TIMESTAMP(3),
  ADD COLUMN "crmAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "crmLastError" TEXT;

CREATE INDEX "submission_crmDirty_idx" ON "submission"("crmDirty");

ALTER TABLE "app_setting"
  ADD COLUMN "crmResendUrl" TEXT,
  ADD COLUMN "crmDripActive" BOOLEAN NOT NULL DEFAULT false;
