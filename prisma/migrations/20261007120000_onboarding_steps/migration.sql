-- Getting-started steps shown to every tenant during trial, authored by the platform
-- owner. Hardcoding them meant they drifted as the product changed, teaching a new
-- customer the wrong thing on the one day they are paying attention.
ALTER TABLE "app_setting" ADD COLUMN "onboardingSteps" JSONB;
