-- Result-page booking CTA clicks.
--
-- The thank-you page lives in the CRM, so a click used to leave the app and never come
-- back: nobody could tell who had asked for a call. The button now routes through
-- /api/cta/[submissionId]/[blockId], which records the click here and forwards on.
--
-- The owner notification is tracked on the row rather than fired and forgotten — a
-- booking request must never be silently lost, so a failed send stays 'pending' and the
-- cron retries it on a backoff.

-- Denormalized first-click stamp, so the Submissions table can show and sort a
-- "Booking requested" column without a join.
ALTER TABLE "submission" ADD COLUMN "ctaClickedAt" TIMESTAMP(3);

CREATE TABLE "cta_click" (
  "id"                  TEXT NOT NULL,
  "submissionId"        TEXT NOT NULL,
  "assessmentId"        TEXT NOT NULL,
  "tenantId"            TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "blockId"             TEXT NOT NULL,
  "label"               TEXT,
  "destinationUrl"      TEXT,
  "ip"                  TEXT,
  "userAgent"           TEXT,
  "notifyEmail"         TEXT,
  "notifyStatus"        TEXT NOT NULL DEFAULT 'pending',
  "notifyAttempts"      INTEGER NOT NULL DEFAULT 0,
  "notifyNextAttemptAt" TIMESTAMP(3),
  "notifyError"         TEXT,
  "notifiedAt"          TIMESTAMP(3),
  CONSTRAINT "cta_click_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cta_click_submissionId_idx" ON "cta_click"("submissionId");
CREATE INDEX "cta_click_assessmentId_idx" ON "cta_click"("assessmentId");
CREATE INDEX "cta_click_tenantId_createdAt_idx" ON "cta_click"("tenantId", "createdAt");
CREATE INDEX "cta_click_createdAt_idx" ON "cta_click"("createdAt");
-- The cron's due-work query: pending notifications whose next attempt has come round.
CREATE INDEX "cta_click_notifyStatus_notifyNextAttemptAt_idx" ON "cta_click"("notifyStatus", "notifyNextAttemptAt");

ALTER TABLE "cta_click" ADD CONSTRAINT "cta_click_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cta_click" ADD CONSTRAINT "cta_click_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
