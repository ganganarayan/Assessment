-- Make name + phone REQUIRED by default for newly created assessments (email was
-- already required by default). Only changes the column DEFAULT for future inserts
-- that don't specify the value (e.g. the text importer) — existing assessments keep
-- whatever they were set to.
ALTER TABLE "assessment" ALTER COLUMN "firstNameRequired" SET DEFAULT true;
ALTER TABLE "assessment" ALTER COLUMN "mobileRequired" SET DEFAULT true;
