-- Active result-statement prompt version (A/B the wording without a deploy).
-- Additive, nullable; null falls back to the code default.
ALTER TABLE "app_setting" ADD COLUMN "aiPromptVersion" TEXT;
