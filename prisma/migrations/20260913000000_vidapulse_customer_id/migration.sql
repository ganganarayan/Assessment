-- VidaPulse identity bridge: pass the opaque Submission.customerId into the VSL
-- embed iframe under a per-tenant param name. Defaults keep it ON with "cid" for
-- every existing row (harmless: an unknown query param is ignored by any player).
ALTER TABLE "app_setting" ADD COLUMN "vidapulseTrackingEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "app_setting" ADD COLUMN "vidapulseParam" TEXT NOT NULL DEFAULT 'cid';
