-- FREE_TEXT joins the question vocabulary: a question whose answer is a sentence the
-- respondent types, with no options to pick from. It scores nothing (the engine and the
-- category maximum skip it) and it routes by the question's default route, since there
-- is no chosen option to hang a rule on.
--
-- 🔴 ITS OWN MIGRATION ON PURPOSE. Postgres forbids USING a new enum value in the same
-- transaction that adds it, and Prisma runs each migration file in one transaction. The
-- columns that reference it live in the next migration, which is why this one is alone.
ALTER TYPE "QuestionType" ADD VALUE 'FREE_TEXT';
