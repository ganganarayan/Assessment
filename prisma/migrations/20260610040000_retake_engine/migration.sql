-- Retake-lockout engine: per-assessment policy + normalized dedup identifier.

-- CreateEnum
CREATE TYPE "RetakePolicy" AS ENUM ('DELAYED', 'NEVER', 'UNLIMITED');
CREATE TYPE "UniqueIdentifier" AS ENUM ('EMAIL', 'MOBILE');

-- Assessment: retake configuration (defaults preserve existing behavior intent).
ALTER TABLE "assessment" ADD COLUMN "retakePolicy" "RetakePolicy" NOT NULL DEFAULT 'DELAYED';
ALTER TABLE "assessment" ADD COLUMN "retakeDays" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "assessment" ADD COLUMN "uniqueIdentifier" "UniqueIdentifier" NOT NULL DEFAULT 'EMAIL';
ALTER TABLE "assessment" ADD COLUMN "trainingUrl" TEXT;

-- Submission: normalized retake/dedup key.
ALTER TABLE "submission" ADD COLUMN "identifierValue" TEXT;

-- Backfill from existing emails (lowercased + trimmed) so prior submissions
-- count toward the lockout/trend for returning respondents.
UPDATE "submission"
SET "identifierValue" = lower(btrim("leadEmail"))
WHERE "leadEmail" IS NOT NULL AND btrim("leadEmail") <> '';

-- CreateIndex
CREATE INDEX "submission_assessmentId_identifierValue_status_idx"
  ON "submission"("assessmentId", "identifierValue", "status");
