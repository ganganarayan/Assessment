-- Throttled background CRM send queue (SCORE + CUSTOM) + per-type window/delay
-- config and the generic CUSTOM sender config on the singleton settings.

CREATE TYPE "CrmSendKind" AS ENUM ('SCORE', 'CUSTOM');
CREATE TYPE "CrmSendStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

CREATE TABLE "crm_send_queue" (
  "id"           TEXT NOT NULL,
  "kind"         "CrmSendKind" NOT NULL,
  "submissionId" TEXT NOT NULL,
  "status"       "CrmSendStatus" NOT NULL DEFAULT 'PENDING',
  "attempts"     INTEGER NOT NULL DEFAULT 0,
  "lastError"    TEXT,
  "contactName"  TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "queuedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt"       TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "crm_send_queue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crm_send_queue_kind_submissionId_key" ON "crm_send_queue"("kind", "submissionId");
CREATE INDEX "crm_send_queue_kind_status_queuedAt_idx" ON "crm_send_queue"("kind", "status", "queuedAt");

ALTER TABLE "crm_send_queue"
  ADD CONSTRAINT "crm_send_queue_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-type window/delay + CUSTOM sender config on the singleton settings.
ALTER TABLE "app_setting"
  ADD COLUMN "crmScoreStartHour"  INTEGER NOT NULL DEFAULT 9,
  ADD COLUMN "crmScoreEndHour"    INTEGER NOT NULL DEFAULT 21,
  ADD COLUMN "crmScoreDelayMin"   INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "crmScoreDelayMax"   INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN "crmCustomName"      TEXT NOT NULL DEFAULT 'Diagnosis',
  ADD COLUMN "crmCustomEventType" TEXT NOT NULL DEFAULT 'diagnosis_update',
  ADD COLUMN "crmCustomFields"    TEXT[] NOT NULL DEFAULT ARRAY['contact_name', 'contact_email', 'contact_phone', 'contact.event_type', 'contact.assessment_diagnosis']::TEXT[],
  ADD COLUMN "crmCustomStartHour" INTEGER NOT NULL DEFAULT 9,
  ADD COLUMN "crmCustomEndHour"   INTEGER NOT NULL DEFAULT 21,
  ADD COLUMN "crmCustomDelayMin"  INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "crmCustomDelayMax"  INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN "crmCustomActive"    BOOLEAN NOT NULL DEFAULT false;
