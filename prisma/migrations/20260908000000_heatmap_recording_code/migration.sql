-- Heatmap / session-recording snippet (e.g. MS Clarity) per tenant. Injected on the
-- tenant's public funnel pages (/a/[slug] + result). Null on every row => off, so
-- existing tenants and the platform/Gita singleton are unaffected until a snippet is set.
ALTER TABLE "app_setting" ADD COLUMN "heatmapCode" TEXT;
