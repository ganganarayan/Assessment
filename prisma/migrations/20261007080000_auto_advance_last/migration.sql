-- Let the last answer go straight on, with no Submit tap.
--
-- Paginated modes already auto-advance a fully answered screen; the last screen was the
-- exception, which is how a respondent could finish every question and never reach the
-- opt-in form. Off by default: a deliberate Submit is also the last chance to change an
-- answer, so existing funnels keep the button.
ALTER TABLE "assessment" ADD COLUMN "autoAdvanceLastScreen" BOOLEAN NOT NULL DEFAULT false;
