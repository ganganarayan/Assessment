-- Lead-capture-AFTER: a separate, editable opt-in button label shown after the
-- questions (distinct from the landing's Start button). Additive + nullable, so
-- existing funnels are unchanged (they fall back to "Show my results").
ALTER TABLE "assessment" ADD COLUMN "resultsButtonLabel" TEXT;
