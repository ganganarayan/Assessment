-- Conditional routing, the half that was missing: a DEFAULT (unconditional) route per
-- question, plus somewhere to keep a typed answer.
--
-- WHY THE DEFAULT ROUTE. Option rules fan a survey out - pick answer 3, go to branch 3 -
-- but they cannot bring it back, because the rule hangs off the option that was chosen.
-- A branch whose last question is optional (skipped, so no option) or FREE_TEXT (no
-- options at all) fell straight through into the NEXT branch's questions. Three columns
-- fix that: when no option rule applies, the question's own route decides. Null on every
-- existing question, so every existing funnel behaves exactly as it did.
--
-- WHY submission_answer CHANGES. A typed answer has no option and no score, so optionId
-- stops being mandatory, value defaults to 0, and the text itself gets a column. All
-- three are catalog-only changes in Postgres (DROP NOT NULL, SET DEFAULT and a nullable
-- ADD COLUMN with no default), so this does not rewrite the table and does not lock out
-- live submissions however many rows are already there.
ALTER TABLE "question"
  ADD COLUMN "defaultRouteAction" "RouteAction",
  ADD COLUMN "defaultTargetQuestionId" TEXT,
  ADD COLUMN "defaultTargetCategoryId" TEXT;

ALTER TABLE "submission_answer"
  ALTER COLUMN "optionId" DROP NOT NULL,
  ALTER COLUMN "value" SET DEFAULT 0,
  ADD COLUMN "textValue" TEXT;
