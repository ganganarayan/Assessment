-- Editable lead-field labels on the opt-in form (null = the built-in default label).
-- Additive + nullable, so it applies cleanly on prod via `prisma migrate deploy`.
ALTER TABLE "assessment" ADD COLUMN "firstNameLabel" TEXT;
ALTER TABLE "assessment" ADD COLUMN "lastNameLabel" TEXT;
ALTER TABLE "assessment" ADD COLUMN "emailLabel" TEXT;
ALTER TABLE "assessment" ADD COLUMN "mobileLabel" TEXT;
ALTER TABLE "assessment" ADD COLUMN "professionLabel" TEXT;
