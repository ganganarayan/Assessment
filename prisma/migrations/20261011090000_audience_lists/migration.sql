-- AudienceList: named lists of roles, replacing the single list per tenant.
--
-- Before this, a workspace had exactly one audience list (app_setting.audienceCanonical),
-- so every funnel on it suggested the same roles. Now a list has a name and an
-- assessment names the one it wants; a gate that names none falls back to the default.
CREATE TABLE "audience_list" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audience_list_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audience_list_tenantId_idx" ON "audience_list"("tenantId");
CREATE UNIQUE INDEX "audience_list_tenantId_name_key" ON "audience_list"("tenantId", "name");

ALTER TABLE "audience_list" ADD CONSTRAINT "audience_list_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 🔴 EXACTLY ONE DEFAULT PER TENANT, enforced by the database - the same reasoning as
-- ad_account. Without it two rows can both be default and the fallback picks
-- arbitrarily between two sets of suggestions, which looks like nothing at all.
CREATE UNIQUE INDEX "audience_list_one_default_per_tenant"
    ON "audience_list"("tenantId") WHERE "isDefault";

-- Backfill: every tenant that has a non-empty canonical list today gets it back as a
-- list called "Default", marked default. The pre-re-home singleton row (tenantId NULL)
-- belongs to the platform tenant, so it is mapped onto 'platform' rather than skipped.
--
-- A row whose tenant no longer exists is dropped by the join - the foreign key would
-- refuse it anyway, and a list nobody can reach is not worth failing a deploy over.
INSERT INTO "audience_list" ("id", "tenantId", "name", "items", "isDefault", "createdAt", "updatedAt")
SELECT
    md5(random()::text || clock_timestamp()::text),
    t."id",
    'Default',
    s."audienceCanonical",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "app_setting" s
JOIN "tenant" t ON t."id" = COALESCE(s."tenantId", 'platform')
WHERE s."audienceCanonical" IS NOT NULL
  AND jsonb_typeof(s."audienceCanonical") = 'array'
  AND jsonb_array_length(s."audienceCanonical") > 0
ON CONFLICT DO NOTHING;
