-- Cloudflare R2 credentials on the platform settings row.
--
-- Moved out of environment variables: env holds only what the app needs to boot, and
-- every integration belongs in in-app Settings. One bucket for the install, with
-- per-tenant isolation by key prefix, so there is one set of keys to rotate and no
-- tenant ever holds credentials reaching another tenant objects.

ALTER TABLE "app_setting" ADD COLUMN "r2AccountId" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "r2AccessKeyId" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "r2SecretAccessKeyEnc" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "r2BucketName" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "r2PublicUrl" TEXT;
