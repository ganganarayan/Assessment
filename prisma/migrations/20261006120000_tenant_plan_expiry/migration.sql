-- Manual access grant: Tenant.plan applies until this moment, then the tenant parks.
-- Nullable with no default, so every existing tenant keeps exactly today's behaviour
-- (no grant), and only a date set by hand on the platform console entitles anything.
ALTER TABLE "tenant" ADD COLUMN "planExpiresAt" TIMESTAMP(3);
