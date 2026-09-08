-- Per-assessment heatmap/recording snippet (e.g. MS Clarity), set in the builder.
-- Null falls back to the tenant's Settings-level snippet at inject time, so existing
-- assessments are unaffected until an override is entered.
ALTER TABLE "assessment" ADD COLUMN "heatmapCode" TEXT;
