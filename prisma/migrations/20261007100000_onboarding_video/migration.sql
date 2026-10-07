-- Onboarding video for a tenant's first screen during trial. Platform-wide: it explains
-- Assess360, not any one workspace. Blank means the written steps appear alone.
ALTER TABLE "app_setting" ADD COLUMN "onboardingVideoUrl" TEXT;
