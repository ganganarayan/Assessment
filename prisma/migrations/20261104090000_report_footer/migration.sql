-- The tenant's own PDF report footer, replacing text every tenant's PDF used to carry.
ALTER TABLE "app_setting" ADD COLUMN "reportFooter" TEXT;

-- Apply Gita keeps the footer it has always printed. Matched by the tenant that owns its
-- domain, so nothing has to name a tenant id; an environment without that row changes
-- nothing.
UPDATE "app_setting"
SET "reportFooter" = E'Ganga Narayan Das - the monk-engineer teaching the Bhagavad Gita as applied neuroscience for executives\napplygitawisdom.com · connect@applygitawisdom.com'
WHERE "tenantId" IN (SELECT "tenantId" FROM "domain" WHERE "hostname" = 'assess.applygitawisdom.com');
