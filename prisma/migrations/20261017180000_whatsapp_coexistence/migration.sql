-- One-click WhatsApp Coexistence onboarding (Embedded Signup v4).
--
-- Two unrelated groups of columns on the same table, because AppSetting is already
-- both things: the platform's singleton row and every tenant's own row.
--
-- PLATFORM (singleton row only): the Meta developer app that every tenant connects
-- THROUGH. One app, ours, which is what being a Tech Provider means. These are
-- settings rather than env vars so that re-creating the app or rotating the secret
-- does not need a deploy.
ALTER TABLE "app_setting" ADD COLUMN "metaAppId" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "metaAppSecretEnc" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "metaEsConfigId" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "metaWebhookVerifyTokenEnc" TEXT;

-- PER TENANT: what the one-click connect found out, filled by the flow and never
-- typed. The access token itself still goes to the existing wabaAccessTokenEnc, so
-- the sender keeps reading exactly the column it always has.
--
-- wabaIsOnBizApp is the coexistence proof: Meta reports is_on_biz_app on the phone
-- number, and a number that answers false is a normal Cloud API number rather than one
-- sharing a phone. Defaults false, which is what every existing row is - nobody has
-- been onboarded this way yet.
ALTER TABLE "app_setting" ADD COLUMN "wabaBusinessId" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "wabaDisplayPhone" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "wabaVerifiedName" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "wabaIsOnBizApp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_setting" ADD COLUMN "wabaOnboardedAt" TIMESTAMP(3);
ALTER TABLE "app_setting" ADD COLUMN "wabaOnboardError" TEXT;
