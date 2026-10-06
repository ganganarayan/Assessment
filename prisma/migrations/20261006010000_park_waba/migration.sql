-- WhatsApp, parked.
--
-- The WABA sender works, but handing it to customers needs template approval, per-tenant
-- numbers and the failure modes both bring. Hiding it is the honest state. A switch
-- rather than a deletion, so turning it back on is a click and nothing a tenant already
-- configured is lost.
--
-- Default FALSE = hidden for customers. The owner's internal tenants always see it.
ALTER TABLE "app_setting" ADD COLUMN "wabaEnabledGlobal" BOOLEAN NOT NULL DEFAULT false;
