-- Per-assessment analytics: revenue denorm on payment + per-assessment reporting floor.
ALTER TABLE "assessment" ADD COLUMN "statsResetAt" TIMESTAMP(3);
ALTER TABLE "payment" ADD COLUMN "assessmentId" TEXT;

CREATE INDEX "payment_assessmentId_createdAt_idx" ON "payment"("assessmentId", "createdAt");

-- Backfill existing payments' assessmentId from their submission (one-time).
UPDATE "payment" p
SET "assessmentId" = s."assessmentId"
FROM "submission" s
WHERE p."submissionId" = s."id" AND p."assessmentId" IS NULL;
