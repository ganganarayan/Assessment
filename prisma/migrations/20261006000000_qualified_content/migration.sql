-- One sentence above the opt-in form.
--
-- After a qualification gate, a respondent went from answering several questions
-- straight to a bare form with nothing acknowledging that they had been let through.
-- This is the space for the offer that belongs there. Nullable, and blank renders
-- nothing, so every existing funnel is unchanged until someone writes the line.
ALTER TABLE "assessment" ADD COLUMN "qualifiedNote" TEXT;
