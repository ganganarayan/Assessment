-- Per-tenant webhooks. null tenantId = platform/Gita (the existing global webhooks).
ALTER TABLE "webhook" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "webhook_log" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "event_log" ADD COLUMN "tenantId" TEXT;

CREATE INDEX "webhook_tenantId_eventType_status_idx" ON "webhook"("tenantId", "eventType", "status");
CREATE INDEX "webhook_log_tenantId_createdAt_idx" ON "webhook_log"("tenantId", "createdAt");
CREATE INDEX "event_log_tenantId_createdAt_idx" ON "event_log"("tenantId", "createdAt");

ALTER TABLE "webhook"
  ADD CONSTRAINT "webhook_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_log"
  ADD CONSTRAINT "webhook_log_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
