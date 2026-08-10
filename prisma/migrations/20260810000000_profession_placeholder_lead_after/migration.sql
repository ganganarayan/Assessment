-- Editable profession dropdown placeholder + "collect the lead AFTER the assessment"
-- flow toggle. Additive + nullable/defaulted, so existing funnels are unchanged.
ALTER TABLE "assessment" ADD COLUMN "professionPlaceholder" TEXT;
ALTER TABLE "assessment" ADD COLUMN "leadCaptureAfter" BOOLEAN NOT NULL DEFAULT false;
