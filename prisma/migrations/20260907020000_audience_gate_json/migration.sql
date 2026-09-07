-- Reshape the audience gate (Phase 2) into a single JSON config that supports a
-- role DROPDOWN with PER-CHOICE routing (each role + "None of the above" routes to
-- another assessment or continues here). Replaces the earlier flat columns. The
-- feature is new (added same day) so no meaningful data is lost.

ALTER TABLE "assessment" DROP COLUMN IF EXISTS "audienceRoles";
ALTER TABLE "assessment" DROP COLUMN IF EXISTS "audienceGateHeading";
ALTER TABLE "assessment" DROP COLUMN IF EXISTS "audienceNoneLabel";
ALTER TABLE "assessment" DROP COLUMN IF EXISTS "routeNextAssessmentId";
ALTER TABLE "assessment" DROP COLUMN IF EXISTS "routeNextUrl";

ALTER TABLE "assessment" ADD COLUMN "audienceGate" JSONB;
