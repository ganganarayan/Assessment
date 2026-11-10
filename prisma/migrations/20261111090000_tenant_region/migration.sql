-- Region, Phase 4 of the multi-tenant review: a tenant's own timezone for respondents and
-- currency for respondent payments. Null = Asia/Kolkata and INR, today's behaviour.
ALTER TABLE "app_setting" ADD COLUMN "timeZone" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "paymentCurrency" TEXT;

-- A payment link charges in the currency it was made in, whatever the tenant picks later.
ALTER TABLE "payment_link" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR';
