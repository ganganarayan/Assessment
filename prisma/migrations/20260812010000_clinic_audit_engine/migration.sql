-- Clinic Audit engine: data-driven patient-acquisition funnel scoring + result page.
-- All additive/nullable — existing GENERIC assessments are unchanged.

-- Assessment engine selector + optional model-parameter overrides.
CREATE TYPE "AssessmentEngine" AS ENUM ('GENERIC', 'CLINIC_AUDIT');
ALTER TABLE "assessment" ADD COLUMN "engine" "AssessmentEngine" NOT NULL DEFAULT 'GENERIC';
ALTER TABLE "assessment" ADD COLUMN "engineConfig" JSONB;

-- Per-question funnel role (null = context/qualifier, not scored).
ALTER TABLE "question" ADD COLUMN "scoringRole" TEXT;

-- Per-option working figure extras for the clinic-audit engine.
ALTER TABLE "option" ADD COLUMN "diagnosisClause" TEXT;
ALTER TABLE "option" ADD COLUMN "isAssumption" BOOLEAN NOT NULL DEFAULT false;
