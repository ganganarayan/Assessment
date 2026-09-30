-- Marketing landing videos (platform only).
--
-- Stored on the singleton AppSetting row and deliberately excluded from the re-home
-- copy: the landing page is the SaaS shopfront, not a tenant asset. Nullable and
-- additive, so existing rows read as "no video" and the hero image keeps rendering.

ALTER TABLE "app_setting" ADD COLUMN "landingVideos" JSONB;
