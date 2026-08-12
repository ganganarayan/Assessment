-- Per-tenant booking/calendar link for the respondent results "Book a call" CTA.
ALTER TABLE "app_setting" ADD COLUMN "bookingUrl" TEXT;
