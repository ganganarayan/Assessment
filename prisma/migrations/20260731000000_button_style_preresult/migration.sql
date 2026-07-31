-- Funnel CTA button styling (per assessment) + optional "pre-results" data-capture
-- page config, and the submission column that stores its answers. All additive +
-- nullable, so it applies cleanly on prod via `prisma migrate deploy`.
ALTER TABLE "assessment" ADD COLUMN "buttonColor" TEXT;
ALTER TABLE "assessment" ADD COLUMN "buttonTextColor" TEXT;
ALTER TABLE "assessment" ADD COLUMN "preResultHeading" TEXT;
ALTER TABLE "assessment" ADD COLUMN "preResultSubtext" TEXT;
ALTER TABLE "assessment" ADD COLUMN "preResultFields" JSONB;
ALTER TABLE "submission" ADD COLUMN "preResultAnswers" JSONB;
