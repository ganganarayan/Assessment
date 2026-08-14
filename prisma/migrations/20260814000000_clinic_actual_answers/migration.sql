-- CLINIC_AUDIT: optional respondent-entered ACTUAL numbers, keyed by questionId,
-- overriding the selected range's midpoint when known.
ALTER TABLE "submission" ADD COLUMN "clinicActualAnswers" JSONB;
