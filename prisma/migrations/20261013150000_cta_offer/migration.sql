-- The one call to action, edited on the platform console instead of in the code.
--
-- All three are nullable: NULL means "use the constant in src/lib/marketing/content.ts",
-- so an unset field renders the shipped copy rather than an empty button.
--
-- NOTE the table name. The Prisma model is AppSetting; the TABLE is app_setting (the
-- model carries @@map). The first cut of this migration said "AppSetting", which does
-- not exist: migrate deploy failed, and because it runs in the start command the
-- container never started. IF NOT EXISTS keeps this re-runnable after that failure.
ALTER TABLE "app_setting" ADD COLUMN IF NOT EXISTS "ctaHref" TEXT;
ALTER TABLE "app_setting" ADD COLUMN IF NOT EXISTS "ctaTrialLabel" TEXT;
ALTER TABLE "app_setting" ADD COLUMN IF NOT EXISTS "ctaDfyLabel" TEXT;
