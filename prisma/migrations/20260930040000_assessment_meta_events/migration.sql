-- Per-assessment Meta event selection.
--
-- Nullable, and null means ALL events on, so every existing assessment keeps
-- reporting exactly what it reported before. Defaulting to off would have quietly
-- stopped populating ad audiences on funnels that are currently spending.

ALTER TABLE "assessment" ADD COLUMN "metaEvents" JSONB;
