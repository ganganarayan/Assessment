-- Extra custom fields on the opt-in form (config on the assessment) + the column
-- that stores each lead's answers. Additive + nullable → clean `migrate deploy`.
ALTER TABLE "assessment" ADD COLUMN "optinFields" JSONB;
ALTER TABLE "submission" ADD COLUMN "optinAnswers" JSONB;
