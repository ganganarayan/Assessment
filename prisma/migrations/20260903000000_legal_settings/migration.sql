-- Legal / company details for the public policy pages (/privacy, /terms, /refund).
-- Platform-level: read from the id="singleton" AppSetting row. Additive + nullable,
-- so existing rows are unchanged.
ALTER TABLE "app_setting" ADD COLUMN "legalEntityName" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "legalAddress" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "legalContactEmail" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "legalGoverningLocation" TEXT;
