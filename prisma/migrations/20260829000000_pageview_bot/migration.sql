-- Flag bot/crawler/renderer page views (e.g. Meta's ad-review agent, which fetches
-- the bare landing URL with no UTM) so human-facing metrics can exclude them. The
-- hit is still recorded and labeled. Additive; existing rows default to human.
ALTER TABLE "page_view" ADD COLUMN "isBot" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "page_view" ADD COLUMN "userAgent" TEXT;
