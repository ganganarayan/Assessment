-- AdAccount: one Meta configuration a tenant can run funnels against.
--
-- The pricing page has metered "ad accounts" (1 / 2 / 10 / 25) since launch while the
-- product had no such concept. This is the model that makes the published claim true.
--
-- Nothing reads this table yet. The resolver switch is a separate change, deliberately:
-- Meta config is on the hot path (every pixel render, every CAPI send), and two sources
-- of truth that disagree fail SILENTLY - events fire against the wrong pixel and nobody
-- notices until an ad account reports numbers that make no sense.
CREATE TABLE "ad_account" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "pixelId" TEXT,
    "capiTokenEnc" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_account_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ad_account_tenantId_idx" ON "ad_account"("tenantId");

ALTER TABLE "ad_account" ADD CONSTRAINT "ad_account_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 🔴 EXACTLY ONE DEFAULT PER TENANT, enforced by the database.
--
-- Prisma cannot express "unique where isDefault", so this is hand-written. Without it
-- two rows can both be default and the resolver picks arbitrarily between two live
-- pixels - which is not an error anywhere, just a funnel quietly reporting to the wrong
-- ad account.
CREATE UNIQUE INDEX "ad_account_one_default_per_tenant"
    ON "ad_account"("tenantId") WHERE "isDefault";

-- Which ad account a funnel reports to. NULL = the tenant's default, so every existing
-- assessment keeps working and no backfill is needed here.
ALTER TABLE "assessment" ADD COLUMN "adAccountId" TEXT;
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_adAccountId_fkey"
    FOREIGN KEY ("adAccountId") REFERENCES "ad_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "assessment_adAccountId_idx" ON "assessment"("adAccountId");

-- Backfill: one ad account per tenant that already has a pixel configured, carrying the
-- exact values the resolver is reading today, marked default.
--
-- TENANTS ONLY. The platform's own pixel lives in platformPixelId/platformCapiTokenEnc
-- and is read by a different path; sweeping it in here would give the SaaS funnel and a
-- customer's funnel one table and two meanings for "default".
INSERT INTO "ad_account" ("id", "tenantId", "label", "pixelId", "capiTokenEnc", "isDefault", "createdAt", "updatedAt")
SELECT
    md5(random()::text || clock_timestamp()::text),
    s."tenantId",
    'Default',
    s."metaPixelId",
    s."metaCapiTokenEnc",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "app_setting" s
WHERE s."tenantId" IS NOT NULL
  AND s."tenantId" <> 'platform'
  AND (s."metaPixelId" IS NOT NULL OR s."metaCapiTokenEnc" IS NOT NULL);
