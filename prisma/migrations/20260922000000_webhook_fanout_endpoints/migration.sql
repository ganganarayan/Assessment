-- Webhook fan-out: allow the SAME delivered event name to fire to multiple
-- endpoints (several CRMs). The delivered name is no longer globally unique;
-- instead only an exact (tenantId, name, url) triple is blocked, so a duplicate
-- endpoint can't be added twice. Delivery already matches on eventType (the
-- trigger), not on name, so no delivery logic changes.
--
-- Since "name" was globally unique until now, no two rows can share a name, so
-- there are no (tenantId, name, url) duplicates to clean up before adding the
-- composite unique — it is safe to create directly.

-- DropIndex: the old global-unique on name.
DROP INDEX "webhook_name_key";

-- CreateIndex: exact-duplicate-endpoint guard (per tenant). Null-tenant/platform
-- dupes are enforced in application code (Postgres treats NULLs as distinct).
CREATE UNIQUE INDEX "webhook_tenantId_name_url_key" ON "webhook"("tenantId", "name", "url");
