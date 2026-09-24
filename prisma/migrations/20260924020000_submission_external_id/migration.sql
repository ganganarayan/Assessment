-- First-party id (per-visitor UUID) captured at Start, sent as Meta CAPI external_id
-- (a standalone match key, no PII) and matched with the browser pixel's external_id.
ALTER TABLE "submission" ADD COLUMN "metaExternalId" TEXT;
