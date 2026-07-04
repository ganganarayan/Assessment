-- Per-tenant settings. The existing id='singleton' row (tenantId NULL) stays the
-- platform/Gita config, unchanged. Each tenant gets ONE additional row keyed by
-- tenantId. A tenant never reads the singleton, so Gita's keys stay private.
ALTER TABLE "app_setting" ADD COLUMN "tenantId" TEXT;

CREATE UNIQUE INDEX "app_setting_tenantId_key" ON "app_setting"("tenantId");

ALTER TABLE "app_setting"
  ADD CONSTRAINT "app_setting_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
