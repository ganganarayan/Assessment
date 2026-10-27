-- The Razorpay subscription a replacement supersedes, held until the replacement is paid.
--
-- Deliberately NOT unique: the value is copied out of "razorpaySubscriptionId" at checkout
-- start, so for a moment the same id would sit in both columns. A unique constraint
-- spanning them would reject the handover.
--
-- Nullable with no backfill. Any row written before this column existed has already lost
-- the id of whatever it replaced, so there is nothing truthful to put here; null is the
-- honest value and the activation simply has nothing to cancel.
-- The table is "subscription" (@@map), the columns stay camelCase like their neighbours.
ALTER TABLE "subscription" ADD COLUMN "priorRazorpaySubscriptionId" TEXT;

-- What an OPEN checkout is buying, as opposed to what the tenant currently holds. The
-- entitlement columns (plan, term, status, limitsSnapshot) used to be overwritten at
-- checkout start, which parked a paying customer and granted them the target tier for
-- free if they abandoned the modal. Nullable, no backfill: a row with no checkout open
-- has no pending anything, and null is exactly that.
--
-- "Plan" and "BillingTerm" are the existing enums; no new type is created here.
ALTER TABLE "subscription" ADD COLUMN "pendingPlan" "Plan";
ALTER TABLE "subscription" ADD COLUMN "pendingTerm" "BillingTerm";
