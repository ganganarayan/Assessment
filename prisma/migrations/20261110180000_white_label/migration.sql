-- White label, Phase 3 of the multi-tenant review.
ALTER TABLE "theme" ADD COLUMN "shareImageUrl" TEXT;

ALTER TABLE "app_setting" ADD COLUMN "privacyUrl" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "termsUrl" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "replyToEmail" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "reportDisclaimer" TEXT;

-- The platform and Apply Gita reports always closed with the clinical line; keep it there
-- (every other workspace now gets the neutral default).
UPDATE "app_setting" SET "reportDisclaimer" = 'This is an indicative self-assessment, not a clinical diagnosis.'
WHERE "id" = 'singleton' AND "reportDisclaimer" IS NULL;

UPDATE "app_setting" SET "reportDisclaimer" = 'This is an indicative self-assessment, not a clinical diagnosis.'
WHERE "reportDisclaimer" IS NULL
  AND "tenantId" IN (SELECT "tenantId" FROM "domain" WHERE "hostname" = 'assess.applygitawisdom.com');
