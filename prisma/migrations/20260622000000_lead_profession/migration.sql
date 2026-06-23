-- Profession capture on the opt-in form.
-- Per-assessment config (mirrors the other lead fields); defaults collect + require
-- to true so the field is mandatory immediately on existing assessments.
ALTER TABLE "assessment"
  ADD COLUMN "collectProfession" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "professionRequired" BOOLEAN NOT NULL DEFAULT true;

-- The chosen profession on each submission (nullable; old rows stay NULL).
ALTER TABLE "submission" ADD COLUMN "leadProfession" TEXT;
