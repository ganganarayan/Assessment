-- Answers to the qualification gate's TEXT questions (keyed by question id), stored
-- for MANUAL review — shown in the Submissions "Custom details". Null = none.
ALTER TABLE "submission" ADD COLUMN "qualificationAnswers" JSONB;
