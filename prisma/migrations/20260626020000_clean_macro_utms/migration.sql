-- One-time cleanup: null out unresolved ad-platform macros (e.g. Meta's
-- "{{site_source_name}}", "{{campaign.name}}") that were stored on page views
-- before normalizeAttribution dropped them, so Stats "Traffic by UTM" is clean.
-- (Contact attribution is JSON re-normalized on read, so it needs no backfill.)
UPDATE "page_view" SET "utmSource"   = NULL WHERE "utmSource"   LIKE '{{%}}';
UPDATE "page_view" SET "utmMedium"   = NULL WHERE "utmMedium"   LIKE '{{%}}';
UPDATE "page_view" SET "utmCampaign" = NULL WHERE "utmCampaign" LIKE '{{%}}';
UPDATE "page_view" SET "utmTerm"     = NULL WHERE "utmTerm"     LIKE '{{%}}';
UPDATE "page_view" SET "utmContent"  = NULL WHERE "utmContent"  LIKE '{{%}}';
