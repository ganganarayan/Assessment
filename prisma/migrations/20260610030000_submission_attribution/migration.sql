-- Capture marketing attribution (utm_*, fbclid, gclid) on the submission,
-- so later events (completed/abandoned/viewed) can carry it in their payload.
ALTER TABLE "submission" ADD COLUMN "attribution" JSONB;
