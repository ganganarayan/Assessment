-- Conditional disqualifying routes: named exits from the Page-1 gate.
--
-- The exits themselves, and which answer routes to which, live inside the two JSONB
-- columns the gate already uses (assessment.qualification, assessment.disqualifiedContent),
-- so there is nothing to migrate there and every gate running today reads back as one
-- exit holding exactly the content it holds now.
--
-- These three columns are what the JSON cannot hold: the outcome of one person's trip
-- through the gate. All nullable, no backfill - a null means "this funnel had no bands
-- and no routes when that row was written", which is the truth.

-- Which score band the gate put a respondent in: PASS or REVIEW. Never shown to them.
ALTER TABLE "submission" ADD COLUMN "gateBand" TEXT;

-- Set when the submission arrived through an OPTIN exit (the waitlist route) rather
-- than through the funnel. Holds the exit key. Also what keeps these rows out of the
-- abandoned sweep: they were never going to answer the assessment.
ALTER TABLE "submission" ADD COLUMN "gateExitKey" TEXT;

-- Which exit a rejection left through, so the per-exit counts can be read back.
ALTER TABLE "gate_disqualification" ADD COLUMN "exitKey" TEXT;

-- Both are read as "the rows for this assessment, grouped by route", never on their own.
CREATE INDEX "submission_gateExitKey_idx" ON "submission"("gateExitKey");
CREATE INDEX "gate_disqualification_exitKey_idx" ON "gate_disqualification"("exitKey");
