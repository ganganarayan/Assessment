-- Real billed AI cost, so the expense in this app is the same number as the invoice.
--
-- The admin keys are a DIFFERENT credential from the generation keys already stored:
-- an Anthropic admin key starts sk-ant-admin and only an org admin can mint one. They
-- read the organisation's cost report and nothing generates with them.
ALTER TABLE "app_setting" ADD COLUMN "aiClaudeAdminKeyEnc" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "aiOpenAiAdminKeyEnc" TEXT;

-- Which API key inside the provider organisation is THIS product's. The cost report
-- bills an organisation, not a product, so a shared account is split by each key's
-- share of the day's tokens. Blank = the whole bill is ours.
ALTER TABLE "app_setting" ADD COLUMN "aiClaudeApiKeyId" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "aiOpenAiApiKeyId" TEXT;

-- One provider, one day, what it actually cost. No rate is ever stored: per-tenant
-- figures are shares of this, so they cannot go stale when prices change.
CREATE TABLE "ai_cost_day" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "billedMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "scopeTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'cost_report',
    "note" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_cost_day_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_cost_day_provider_day_key" ON "ai_cost_day"("provider", "day");
CREATE INDEX "ai_cost_day_day_idx" ON "ai_cost_day"("day");
