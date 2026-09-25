-- Billing gate: capture-but-lock over-cap responses + a respondent support address.

-- submission.periodSeq: 1-based index of this completion within its tenant's billing
-- period, stamped at the winning STARTED->COMPLETED flip from the RESPONSES usage
-- counter. A response is "over cap / locked" when periodSeq > the tenant's CURRENT
-- responsesPerMonth limit (compared live, so a plan upgrade unlocks past leads with no
-- backfill). NULL = completed before this gate shipped, or an unmetered platform row.
ALTER TABLE "submission" ADD COLUMN "periodSeq" INTEGER;

-- app_setting.supportEmail: the support address shown to a RESPONDENT on the neutral
-- "results unavailable — contact support" screen when the tenant is over its response
-- cap. Per-tenant; the singleton row is the platform/Gita fallback. NULL = none shown.
ALTER TABLE "app_setting" ADD COLUMN "supportEmail" TEXT;
