-- Marketing-funnel analytics for the Assess360 SaaS landing (super-admin dashboard).

-- Tenant acquisition attribution (the ad/campaign a self-serve signup came from).
ALTER TABLE "tenant" ADD COLUMN "acquisitionAttribution" JSONB;
ALTER TABLE "tenant" ADD COLUMN "acqUtmSource" TEXT;
ALTER TABLE "tenant" ADD COLUMN "acqUtmMedium" TEXT;
ALTER TABLE "tenant" ADD COLUMN "acqUtmCampaign" TEXT;
ALTER TABLE "tenant" ADD COLUMN "acqUtmTerm" TEXT;
ALTER TABLE "tenant" ADD COLUMN "acqUtmContent" TEXT;

-- Landing page-view log (top of the SaaS funnel; no assessment scope).
CREATE TABLE "platform_page_view" (
  "id"           TEXT NOT NULL,
  "visitorId"    TEXT NOT NULL,
  "path"         TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "utmSource"    TEXT,
  "utmMedium"    TEXT,
  "utmCampaign"  TEXT,
  "utmTerm"      TEXT,
  "utmContent"   TEXT,
  "fbclid"       TEXT,
  "gclid"        TEXT,
  "referrerHost" TEXT,
  "isBot"        BOOLEAN NOT NULL DEFAULT false,
  "userAgent"    TEXT,
  "ip"           TEXT,
  "country"      TEXT,
  "city"         TEXT,
  "region"       TEXT,
  "deviceType"   TEXT,
  "browser"      TEXT,
  "os"           TEXT,
  CONSTRAINT "platform_page_view_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "platform_page_view_createdAt_idx" ON "platform_page_view"("createdAt");
CREATE INDEX "platform_page_view_visitorId_idx" ON "platform_page_view"("visitorId");
CREATE INDEX "platform_page_view_utmSource_idx" ON "platform_page_view"("utmSource");
CREATE INDEX "platform_page_view_utmCampaign_idx" ON "platform_page_view"("utmCampaign");
