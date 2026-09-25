-- RazorpayPlan: runtime cache of Razorpay Plan objects created via the API (no
-- dashboard-made plans). Keyed by our PlanId; created once per tier, reused after.
CREATE TABLE "razorpay_plan" (
  "planKey"        TEXT NOT NULL,
  "razorpayPlanId" TEXT NOT NULL,
  "amountCents"    INTEGER NOT NULL,
  "currency"       TEXT NOT NULL DEFAULT 'USD',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "razorpay_plan_pkey" PRIMARY KEY ("planKey")
);
CREATE UNIQUE INDEX "razorpay_plan_razorpayPlanId_key" ON "razorpay_plan"("razorpayPlanId");
