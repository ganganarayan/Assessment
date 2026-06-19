-- AI personalized result statement. All additive.

-- Platform-level AI config (singleton). API key stored encrypted at rest.
ALTER TABLE "app_setting" ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_setting" ADD COLUMN "aiProvider" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "aiModel" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "aiApiKeyEnc" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "aiGuidance" TEXT;

-- Per-submission generated statement (stored against the submission/date).
ALTER TABLE "submission" ADD COLUMN "aiStatement" TEXT;
