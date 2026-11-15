-- Per-run Meta event log: browser pixel beacons and server CAPI sends, one row each.
-- Additive and empty on arrival.
CREATE TABLE "run_event" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "assessmentId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventId" TEXT,
    "isPreview" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "run_event_assessmentId_createdAt_idx" ON "run_event"("assessmentId", "createdAt");
CREATE INDEX "run_event_assessmentId_visitorId_idx" ON "run_event"("assessmentId", "visitorId");

ALTER TABLE "run_event" ADD CONSTRAINT "run_event_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
