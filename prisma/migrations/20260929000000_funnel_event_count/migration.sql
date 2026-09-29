-- How many Meta events the funnel actually FIRED, as a running count per assessment
-- per event per IST day. GateDisqualified fires browser-side only, so nothing
-- server-side ever recorded it: the app could not say whether the exclusion audience
-- was being built. A row per firing would duplicate gate_disqualification (which
-- counts people) and grow without bound, so this is incremented in place.
CREATE TABLE "funnel_event_count" (
  "id"           TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "tenantId"     TEXT,
  "eventName"    TEXT NOT NULL,
  "day"          TIMESTAMP(3) NOT NULL,
  "count"        INTEGER NOT NULL DEFAULT 0,
  "failed"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "funnel_event_count_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "funnel_event_count_assessmentId_eventName_day_key"
  ON "funnel_event_count"("assessmentId", "eventName", "day");
CREATE INDEX "funnel_event_count_tenantId_day_idx" ON "funnel_event_count"("tenantId", "day");
CREATE INDEX "funnel_event_count_eventName_day_idx" ON "funnel_event_count"("eventName", "day");

ALTER TABLE "funnel_event_count"
  ADD CONSTRAINT "funnel_event_count_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- gate_entry carries the tenant now, so "Qualified" (gate passed) reads through the
-- same tenant + date scope as every other number on the Stats page. Backfilled from
-- the owning assessment; new rows set it at write time.
ALTER TABLE "gate_entry" ADD COLUMN "tenantId" TEXT;

UPDATE "gate_entry" ge
   SET "tenantId" = a."tenantId"
  FROM "assessment" a
 WHERE a."id" = ge."assessmentId";

CREATE INDEX "gate_entry_assessmentId_passedAt_idx" ON "gate_entry"("assessmentId", "passedAt");
CREATE INDEX "gate_entry_tenantId_passedAt_idx" ON "gate_entry"("tenantId", "passedAt");

-- GateDisqualified now fires SERVER-side (CAPI), so the audience-refresh decision
-- has to be readable from the database instead of the visitor's localStorage.
ALTER TABLE "gate_disqualification" ADD COLUMN "capiFiredAt" TIMESTAMP(3);

CREATE INDEX "gate_disqualification_assessmentId_visitorId_idx"
  ON "gate_disqualification"("assessmentId", "visitorId");
