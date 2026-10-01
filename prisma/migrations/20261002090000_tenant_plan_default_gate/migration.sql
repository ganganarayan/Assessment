-- Tenant.plan defaulted to FREE, a catalog value that no longer exists. Resolution does
-- not read this column (the subscription and the trial decide), so this is about the
-- database not asserting something false rather than about entitlement.
ALTER TABLE "tenant" ALTER COLUMN "plan" SET DEFAULT 'GATE';
