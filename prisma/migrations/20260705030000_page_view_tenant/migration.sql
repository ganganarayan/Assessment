-- Per-tenant page views (for scoped Stats). null tenantId = platform/Gita.
-- Scalar column only (no FK) — page_view is high-write and already cascades via
-- its assessment. Stamped from the assessment's tenantId at view time.
ALTER TABLE "page_view" ADD COLUMN "tenantId" TEXT;

CREATE INDEX "page_view_tenantId_createdAt_idx" ON "page_view"("tenantId", "createdAt");
