-- The one call to action, editable from the super-admin settings page instead of a
-- code edit and a deploy. All three are nullable: NULL means "use the constant in
-- src/lib/marketing/content.ts", so an unset field renders the shipped copy rather
-- than an empty button.
ALTER TABLE "AppSetting" ADD COLUMN IF NOT EXISTS "ctaHref" TEXT;
ALTER TABLE "AppSetting" ADD COLUMN IF NOT EXISTS "ctaTrialLabel" TEXT;
ALTER TABLE "AppSetting" ADD COLUMN IF NOT EXISTS "ctaDfyLabel" TEXT;
