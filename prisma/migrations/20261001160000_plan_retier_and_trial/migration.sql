-- Re-tier: Gate / Signal / Agency / Enterprise, and the 14-day trial.
--
-- The old values stay in the enum. Postgres cannot drop one without recreating the type
-- and rewriting every column that uses it, which is not worth it for names no code reads
-- any more — PLAN_IDS in plans.ts is the catalog, and it no longer lists them.
--
-- No backfill of existing rows is needed: there are no customers (one super admin and
-- two owner-owned tenants as of 2026-10-01), so nothing is on a plan anyone paid for.
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'GATE';
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'SIGNAL';
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'AGENCY';
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'ENTERPRISE';

-- 14-day Signal trial. Null = never trialled or already converted.
ALTER TABLE "tenant" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
