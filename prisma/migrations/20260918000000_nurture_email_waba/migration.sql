-- Nurture: one-shot Email (SMTP) + WhatsApp (Meta Cloud API) on opt-in, per tenant.
-- Connection creds + the message config live on each tenant's app_setting row
-- (singleton = platform/Gita). All nullable => existing tenants send nothing until
-- configured and enabled.

-- SMTP + WABA connection + nurture message config (per tenant / singleton).
ALTER TABLE "app_setting" ADD COLUMN "smtpHost" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "smtpPort" INTEGER;
ALTER TABLE "app_setting" ADD COLUMN "smtpSecure" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_setting" ADD COLUMN "smtpUser" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "smtpPassEnc" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "smtpFromName" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "smtpFromEmail" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "wabaPhoneNumberId" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "wabaAccessTokenEnc" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "wabaApiVersion" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "wabaDefaultCountryCode" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "nurtureConfig" JSONB;

-- Guard: nurture runs once per submission.
ALTER TABLE "submission" ADD COLUMN "nurtureSentAt" TIMESTAMP(3);

-- Per-attempt send log.
CREATE TABLE "nurture_log" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "submissionId" TEXT,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "toAddress" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "nurture_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "nurture_log_tenantId_createdAt_idx" ON "nurture_log"("tenantId", "createdAt");
CREATE INDEX "nurture_log_submissionId_idx" ON "nurture_log"("submissionId");
ALTER TABLE "nurture_log" ADD CONSTRAINT "nurture_log_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nurture_log" ADD CONSTRAINT "nurture_log_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
