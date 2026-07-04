-- Per-tenant payment + CAPI data isolation. null tenantId = platform/Gita.
-- Additive only: does NOT change how payments are recorded or how CAPI fires; it
-- just tags each row with its owning tenant (denormalized from the submission).
ALTER TABLE "payment" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "capi_log" ADD COLUMN "tenantId" TEXT;

CREATE INDEX "payment_tenantId_createdAt_idx" ON "payment"("tenantId", "createdAt");
CREATE INDEX "capi_log_tenantId_createdAt_idx" ON "capi_log"("tenantId", "createdAt");

ALTER TABLE "payment"
  ADD CONSTRAINT "payment_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "capi_log"
  ADD CONSTRAINT "capi_log_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
