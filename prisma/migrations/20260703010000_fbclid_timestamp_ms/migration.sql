-- Move fbclidTimestamp to unix MILLISECONDS (matches Meta's fbc format exactly).
-- Widen the column first (a ms epoch overflows int4), then convert the existing
-- SECONDS values to ms. The guard (< 1e11) skips anything already in ms, so the
-- conversion is safe to re-run and won't double-scale.
ALTER TABLE "submission" ALTER COLUMN "fbclidTimestamp" TYPE DOUBLE PRECISION;

UPDATE "submission"
SET "fbclidTimestamp" = "fbclidTimestamp" * 1000
WHERE "fbclidTimestamp" IS NOT NULL
  AND "fbclidTimestamp" < 100000000000;
