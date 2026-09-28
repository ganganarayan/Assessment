-- Qualification-gate rejection log (ASSESSMENT funnel only).
-- The gate creates no lead / submission / result, so a disqualified visitor used to
-- leave no trace: every in-app counter read 0 while Meta still counted the exclusion
-- event. `repeat` separates a fresh rejection from a revisit by an already-rejected
-- visitor, so the gate's true reach is readable instead of inflated by return traffic.
CREATE TABLE "gate_disqualification" (
  "id"           TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "visitorId"    TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "questionId"   TEXT,
  "optionId"     TEXT,
  "repeat"       BOOLEAN NOT NULL DEFAULT false,
  "utmSource"    TEXT,
  "utmMedium"    TEXT,
  "utmCampaign"  TEXT,
  "utmTerm"      TEXT,
  "utmContent"   TEXT,
  "fbclid"       TEXT,
  "gclid"        TEXT,
  "isBot"        BOOLEAN NOT NULL DEFAULT false,
  "userAgent"    TEXT,
  "ip"           TEXT,
  "country"      TEXT,
  "city"         TEXT,
  "region"       TEXT,
  "postalCode"   TEXT,
  "timezone"     TEXT,
  "deviceType"   TEXT,
  "browser"      TEXT,
  "os"           TEXT,
  "tenantId"     TEXT,
  CONSTRAINT "gate_disqualification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gate_disqualification_assessmentId_idx" ON "gate_disqualification"("assessmentId");
CREATE INDEX "gate_disqualification_visitorId_idx" ON "gate_disqualification"("visitorId");
CREATE INDEX "gate_disqualification_createdAt_idx" ON "gate_disqualification"("createdAt");
CREATE INDEX "gate_disqualification_utmSource_idx" ON "gate_disqualification"("utmSource");
CREATE INDEX "gate_disqualification_utmCampaign_idx" ON "gate_disqualification"("utmCampaign");
CREATE INDEX "gate_disqualification_tenantId_createdAt_idx" ON "gate_disqualification"("tenantId", "createdAt");

ALTER TABLE "gate_disqualification"
  ADD CONSTRAINT "gate_disqualification_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
