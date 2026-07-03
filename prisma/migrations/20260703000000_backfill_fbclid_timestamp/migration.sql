-- Backfill fbclidTimestamp for contacts captured before it was recorded (and for
-- any row where it is null): use the opt-in moment (startedAt) as the anchor, so a
-- past contact that has an fbclid can still have its fbc rebuilt as
-- fb.1.<ts>.<fbclid>. Rows with an fbclid but no timestamp were losing attribution.
UPDATE "submission"
SET "fbclidTimestamp" = FLOOR(EXTRACT(EPOCH FROM "startedAt"))::int
WHERE "fbclidTimestamp" IS NULL;
