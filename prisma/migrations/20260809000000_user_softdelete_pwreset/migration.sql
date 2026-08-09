-- Soft-delete + forced-password-change on users, and the platform password-reset
-- webhook URL on the singleton. Additive + nullable/defaulted → clean migrate deploy.
ALTER TABLE "user" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "user" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_setting" ADD COLUMN "passwordResetWebhookUrl" TEXT;
