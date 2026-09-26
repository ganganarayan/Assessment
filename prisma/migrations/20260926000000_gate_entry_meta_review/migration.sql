-- AssessmentAbandoned retargeting + manual Meta review of a lead.

-- Manual review stamps: set when the owner fires QualifiedCompletion /
-- GateDisqualified by hand from the Submissions table, so a reviewed row is
-- visibly different from an untouched one on a long list.
ALTER TABLE "submission" ADD COLUMN "metaQualifiedAt"    TIMESTAMP(3);
ALTER TABLE "submission" ADD COLUMN "metaDisqualifiedAt" TIMESTAMP(3);

-- One row per visitor who PASSED the qualification gate (page 1).
--
-- Passing page 1 creates no submission (the opt-in is the LAST step), so a
-- visitor who qualifies and then leaves is otherwise invisible — exactly the
-- person worth retargeting. This row holds the Meta match signals captured
-- server-side at pass time, because by the time the abandonment sweep fires
-- hours later the browser is long gone.
--
-- It is NOT a submission: no lead, no answers, no score, and it never reaches
-- the Submissions table, counts, billing caps or stats.
CREATE TABLE "gate_entry" (
  "id"               TEXT NOT NULL,
  "assessmentId"     TEXT NOT NULL,
  -- Browser first-party visitor id → submission."metaExternalId" → CAPI external_id.
  -- This is how the sweep tells "abandoned" from "went on to complete".
  "visitorId"        TEXT NOT NULL,
  "clientIp"         TEXT,
  "userAgent"        TEXT,
  "fbp"              TEXT,
  "fbc"              TEXT,
  "country"          TEXT,
  "city"             TEXT,
  "region"           TEXT,
  "postalCode"       TEXT,
  "attribution"      JSONB,
  "passedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Compare-and-swap guard: set when AssessmentAbandoned fired, so it fires once.
  "abandonedFiredAt" TIMESTAMP(3),
  CONSTRAINT "gate_entry_pkey" PRIMARY KEY ("id")
);

-- One row per visitor per assessment: a re-entry updates the existing row rather
-- than queueing a second abandonment event for the same person.
CREATE UNIQUE INDEX "gate_entry_assessmentId_visitorId_key" ON "gate_entry"("assessmentId", "visitorId");
-- The sweep's scan: unfired rows older than the cutoff.
CREATE INDEX "gate_entry_abandonedFiredAt_passedAt_idx" ON "gate_entry"("abandonedFiredAt", "passedAt");

ALTER TABLE "gate_entry"
  ADD CONSTRAINT "gate_entry_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
