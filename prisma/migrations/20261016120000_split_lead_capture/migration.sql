-- SPLIT lead capture: ask for the name, the email and the phone at three different
-- moments in the run instead of all on one screen.
--
-- Nothing here changes an existing funnel. "LeadCaptureMode" defaults to ALL_AT_ONCE,
-- which is the behaviour every assessment has today, and leadCaptureAfter keeps
-- deciding the position in that mode. The gate_entry columns are all nullable and are
-- written only by the split route.
--
-- 🔴 A NEW enum TYPE, not a new value on an existing one. Postgres forbids USING a
-- newly added enum value inside the transaction that adds it, which is why
-- next_step_no_result had to be a migration of its own. Creating a type and a column
-- of that type together is fine.

CREATE TYPE "LeadCaptureMode" AS ENUM ('ALL_AT_ONCE', 'SPLIT');

ALTER TABLE "assessment"
  ADD COLUMN "leadCaptureMode" "LeadCaptureMode" NOT NULL DEFAULT 'ALL_AT_ONCE';

-- The lead, captured in stages and held here until the assessment is answered. On an
-- ALL_AT_ONCE funnel every one of these stays null, which is every existing row.
ALTER TABLE "gate_entry"
  ADD COLUMN "customerId"           TEXT,
  ADD COLUMN "leadToken"            TEXT,
  ADD COLUMN "leadFirstName"        TEXT,
  ADD COLUMN "leadLastName"         TEXT,
  ADD COLUMN "leadEmail"            TEXT,
  ADD COLUMN "leadProfession"       TEXT,
  ADD COLUMN "audienceRole"         TEXT,
  ADD COLUMN "emailCapturedAt"      TIMESTAMP(3),
  ADD COLUMN "identifierValue"      TEXT,
  ADD COLUMN "gateScore"            INTEGER,
  ADD COLUMN "gateMax"              INTEGER,
  ADD COLUMN "gateBand"             TEXT,
  ADD COLUMN "gateBreakdown"        JSONB,
  ADD COLUMN "qualificationAnswers" JSONB,
  ADD COLUMN "optinAnswers"         JSONB,
  ADD COLUMN "submissionId"         TEXT;

-- One cid per person and one submission per lead row: the join between the Gate
-- qualified menu and Submissions has to be exactly one to one, or the same person
-- gets counted twice in the lead numbers the ad spend is judged on.
CREATE UNIQUE INDEX "gate_entry_customerId_key"   ON "gate_entry"("customerId");
CREATE UNIQUE INDEX "gate_entry_submissionId_key" ON "gate_entry"("submissionId");

CREATE INDEX "gate_entry_assessmentId_emailCapturedAt_idx" ON "gate_entry"("assessmentId", "emailCapturedAt");
CREATE INDEX "gate_entry_tenantId_emailCapturedAt_idx"     ON "gate_entry"("tenantId", "emailCapturedAt");
CREATE INDEX "gate_entry_assessmentId_identifierValue_idx" ON "gate_entry"("assessmentId", "identifierValue");
