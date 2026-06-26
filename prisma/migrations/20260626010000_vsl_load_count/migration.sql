-- Per-contact VSL load counter: total successful /api/r reads (each VSL page load
-- increments it). Seed existing contacts that already loaded at least once to 1 so
-- their count does not reset to 0.
ALTER TABLE "submission" ADD COLUMN "resultFetchCount" INTEGER NOT NULL DEFAULT 0;
UPDATE "submission" SET "resultFetchCount" = 1 WHERE "resultFetchedAt" IS NOT NULL;
