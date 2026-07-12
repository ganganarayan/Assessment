-- Per-provider AI keys: store one encrypted key per provider (Claude/OpenAI/Gemini)
-- so changing the selected provider or model never re-prompts for a key or breaks
-- generation. Back-compat: the legacy single key column stays and is backfilled into
-- the column matching the currently-selected provider.

ALTER TABLE "app_setting" ADD COLUMN "aiClaudeKeyEnc" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "aiOpenAiKeyEnc" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "aiGeminiKeyEnc" TEXT;

-- Preserve the existing key: move it into the slot for the provider in use now.
UPDATE "app_setting" SET "aiClaudeKeyEnc" = "aiApiKeyEnc"
  WHERE "aiProvider" = 'claude' AND "aiApiKeyEnc" IS NOT NULL;
UPDATE "app_setting" SET "aiOpenAiKeyEnc" = "aiApiKeyEnc"
  WHERE "aiProvider" = 'openai' AND "aiApiKeyEnc" IS NOT NULL;
UPDATE "app_setting" SET "aiGeminiKeyEnc" = "aiApiKeyEnc"
  WHERE "aiProvider" = 'gemini' AND "aiApiKeyEnc" IS NOT NULL;
