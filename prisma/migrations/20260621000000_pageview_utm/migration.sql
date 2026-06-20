-- Capture marketing attribution on page views (before any lead exists), so the
-- Stats page can show traffic by UTM and a per-visit log. All additive.
ALTER TABLE "page_view" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "page_view" ADD COLUMN "utmMedium" TEXT;
ALTER TABLE "page_view" ADD COLUMN "utmCampaign" TEXT;
ALTER TABLE "page_view" ADD COLUMN "utmTerm" TEXT;
ALTER TABLE "page_view" ADD COLUMN "utmContent" TEXT;
ALTER TABLE "page_view" ADD COLUMN "fbclid" TEXT;
ALTER TABLE "page_view" ADD COLUMN "gclid" TEXT;

CREATE INDEX "page_view_createdAt_idx" ON "page_view"("createdAt");
CREATE INDEX "page_view_utmSource_idx" ON "page_view"("utmSource");
CREATE INDEX "page_view_utmCampaign_idx" ON "page_view"("utmCampaign");
