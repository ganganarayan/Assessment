-- Mark the runs an owner made while previewing their own funnel.
--
-- Everything about a preview stays real except the server-side Meta conversion: the
-- submission, the browser pixel, the page view, the webhook. The owner is testing
-- whether those work and watching them in Pixel Helper.
--
-- Stored rather than passed around because some events fire LATER - the abandon sweep
-- and the CRM drip run hours afterwards, long after the request flag is gone. Without
-- a column they would report the owner's own walkthrough to a live ad account.
--
-- Defaults false, so every existing row is what it always was: a real respondent.
ALTER TABLE "submission" ADD COLUMN "isPreview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "gate_entry" ADD COLUMN "isPreview" BOOLEAN NOT NULL DEFAULT false;
