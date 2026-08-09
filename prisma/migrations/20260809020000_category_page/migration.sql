-- 2nd scored "queries" page: a category belongs to page 1 (assessment) or 2 (queries).
-- Additive + defaulted, so existing categories stay on page 1 (unchanged behaviour).
ALTER TABLE "category" ADD COLUMN "page" INTEGER NOT NULL DEFAULT 1;
