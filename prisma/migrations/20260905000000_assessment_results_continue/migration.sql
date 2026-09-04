-- "Show results on assess360" onward button: an OPTIONAL plain external link (and
-- optional button label) rendered under the result page (generic band result + the
-- clinic recalc). No token is appended. Additive + nullable, so every existing
-- assessment is unchanged (null => no button).
ALTER TABLE "assessment" ADD COLUMN "resultsContinueUrl" TEXT;
ALTER TABLE "assessment" ADD COLUMN "resultsContinueLabel" TEXT;
