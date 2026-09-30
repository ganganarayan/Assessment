-- Tenant soft delete.
--
-- Deleting a tenant used to be a single irreversible cascade: one click plus a typed
-- slug destroyed every assessment, lead, payment, webhook and setting the tenant
-- owned. Now the first delete only stamps this column, and the permanent cascade is a
-- separate action reachable only from the deleted list.
--
-- Additive and nullable, so existing rows are untouched and read as "not deleted".

ALTER TABLE "tenant" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "tenant_deletedAt_idx" ON "tenant"("deletedAt");
