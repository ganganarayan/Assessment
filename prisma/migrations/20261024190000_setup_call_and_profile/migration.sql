-- The business profile the guided setup now asks for, before anything is imported.
-- Nullable throughout: every existing workspace predates these questions and must stay
-- valid without them.
ALTER TABLE "tenant" ADD COLUMN "sells" TEXT;
ALTER TABLE "tenant" ADD COLUMN "pricePoint" TEXT;
ALTER TABLE "tenant" ADD COLUMN "badLead" TEXT;
ALTER TABLE "tenant" ADD COLUMN "afterTheYes" TEXT;
ALTER TABLE "tenant" ADD COLUMN "industry" TEXT;
ALTER TABLE "tenant" ADD COLUMN "industryOther" TEXT;

-- The platform's own booking link for the setup call (read from the singleton row
-- only), and the stamp that stops the three seeded events from ever being sent twice.
ALTER TABLE "app_setting" ADD COLUMN "callBookingTypeId" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "callBookingUrl" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "capiSeededAt" TIMESTAMP(3);
