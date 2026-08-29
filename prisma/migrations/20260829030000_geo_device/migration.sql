-- Geo (Cloudflare headers) + device (parsed UA) enrichment on page views and
-- submissions. region/postalCode/country also feed Meta CAPI advanced matching.
-- Additive; all null for existing rows and until the CF location transform is on.
ALTER TABLE "page_view" ADD COLUMN "country" TEXT;
ALTER TABLE "page_view" ADD COLUMN "city" TEXT;
ALTER TABLE "page_view" ADD COLUMN "region" TEXT;
ALTER TABLE "page_view" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "page_view" ADD COLUMN "timezone" TEXT;
ALTER TABLE "page_view" ADD COLUMN "deviceType" TEXT;
ALTER TABLE "page_view" ADD COLUMN "browser" TEXT;
ALTER TABLE "page_view" ADD COLUMN "os" TEXT;

ALTER TABLE "submission" ADD COLUMN "country" TEXT;
ALTER TABLE "submission" ADD COLUMN "city" TEXT;
ALTER TABLE "submission" ADD COLUMN "region" TEXT;
ALTER TABLE "submission" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "submission" ADD COLUMN "timezone" TEXT;
ALTER TABLE "submission" ADD COLUMN "deviceType" TEXT;
ALTER TABLE "submission" ADD COLUMN "browser" TEXT;
ALTER TABLE "submission" ADD COLUMN "os" TEXT;
