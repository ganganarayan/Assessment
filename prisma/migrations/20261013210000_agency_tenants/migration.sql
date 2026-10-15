-- Agency tenants: a workspace that belongs to an AGENCY ADMIN rather than directly to
-- the super admin, plus the paid slots beyond the plan's included count.
--
-- Additive and nullable, so every existing tenant row stays a direct tenant with no
-- backfill. ON DELETE RESTRICT is the point of the constraint: deleting an agency
-- admin's workspace must fail loudly while it still has agency tenants, rather than
-- cascading away several separate businesses.
ALTER TABLE "tenant" ADD COLUMN "agencyAdminTenantId" TEXT;

CREATE INDEX "tenant_agencyAdminTenantId_idx" ON "tenant"("agencyAdminTenantId");

ALTER TABLE "tenant" ADD CONSTRAINT "tenant_agencyAdminTenantId_fkey"
  FOREIGN KEY ("agencyAdminTenantId") REFERENCES "tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Slots bought beyond the included count ($29/mo each), carried on a SECOND Razorpay
-- subscription because quantity on the base plan would multiply the base price.
ALTER TABLE "subscription" ADD COLUMN "extraAgencyTenants" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "subscription" ADD COLUMN "razorpaySlotSubscriptionId" TEXT;

CREATE UNIQUE INDEX "subscription_razorpaySlotSubscriptionId_key"
  ON "subscription"("razorpaySlotSubscriptionId");
