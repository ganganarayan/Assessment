-- Monthly or yearly, per subscription.
--
-- Every subscription that exists today is monthly: that is all getOrCreatePlan could
-- ever create, so the default is the truth for existing rows rather than a guess, and
-- the column is NOT NULL from the start with no backfill pass needed.
--
-- The column is read by two things that are wrong by a factor of twelve without it: the
-- renewal date (+1 month or +12) and the RESPONSES usage window, which keys off the
-- Razorpay period start. Razorpay moves that start once per charge, so on a yearly
-- subscription it moves once a year and an annual customer would hold one usage key for
-- twelve months - one month's allowance for the year they paid for up front.
CREATE TYPE "BillingTerm" AS ENUM ('MONTHLY', 'YEARLY');

ALTER TABLE "subscription" ADD COLUMN "term" "BillingTerm" NOT NULL DEFAULT 'MONTHLY';
