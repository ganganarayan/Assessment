-- CRM "diagnosis_update" backfill: its own destination endpoint on the
-- singleton settings, distinct from crmResendUrl (the score_updated automation).
ALTER TABLE "app_setting"
  ADD COLUMN "crmDiagnosisUrl" TEXT;
