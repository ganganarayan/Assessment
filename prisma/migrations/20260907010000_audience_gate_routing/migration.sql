-- Audience gate + cascade routing (Phase 2). Additive columns only. Defaults keep
-- every existing assessment behaving exactly as before (empty roles = no gate;
-- fireMetaCapi true = fires Meta as today).

-- Assessment: the gate config + onward route + Meta CAPI switch.
ALTER TABLE "assessment" ADD COLUMN "audienceRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "assessment" ADD COLUMN "audienceGateHeading" TEXT;
ALTER TABLE "assessment" ADD COLUMN "audienceNoneLabel" TEXT;
ALTER TABLE "assessment" ADD COLUMN "routeNextAssessmentId" TEXT;
ALTER TABLE "assessment" ADD COLUMN "routeNextUrl" TEXT;
ALTER TABLE "assessment" ADD COLUMN "fireMetaCapi" BOOLEAN NOT NULL DEFAULT true;

-- Submission: which gate role the respondent picked (separate from leadProfession).
ALTER TABLE "submission" ADD COLUMN "audienceRole" TEXT;
