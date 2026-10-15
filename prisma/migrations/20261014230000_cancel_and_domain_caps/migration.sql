-- Cancellation + custom-domain caps.
--
-- Both additive with defaults, so no backfill and no row changes meaning: every existing
-- subscription starts with zero purchased domains, and every install starts with no exit
-- assessment configured (the cancel then simply confirms).

-- Where a cancelling customer is sent to be asked why. Owner-authored on /admin/settings.
ALTER TABLE "app_setting" ADD COLUMN "cancelExitAssessmentUrl" TEXT;

-- Custom domains bought beyond the one every workspace includes. ADDITIVE on top of the
-- plan's count, which is why it is a column and not a limitOverrides entry: an override
-- REPLACES the plan's number and so could never say "one more than whatever they are on".
ALTER TABLE "subscription" ADD COLUMN "extraCustomDomains" INTEGER NOT NULL DEFAULT 0;
