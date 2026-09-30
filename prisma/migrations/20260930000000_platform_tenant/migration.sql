-- Platform tenant — the SaaS itself, as a real Tenant row.
--
-- WHY: `tenantId = null` was overloaded to mean five different things (unmetered,
-- use env, the platform's own rows, and — contradictorily — "show every tenant").
-- Giving the platform a real row is what lets those meanings be told apart. See
-- src/lib/tenant/platform-tenant.ts.
--
-- The id is the literal 'platform', not a cuid, so recognising the platform is a
-- string compare on a hot path instead of a query. The app code in this same commit
-- depends on this row existing, and this migration runs in the deploy start command
-- ahead of the server, so the ordering holds.
--
-- SCOPE OF THIS MIGRATION: create the row. NOTHING ELSE.
-- It deliberately does NOT move any data. The re-home is a deliberate, dry-runnable
-- operation with a manifest and an exact revert (`npm run rehome`), because it
-- decides which tenant owns a live funnel's leads, pixel and payments. Putting that
-- in `prisma migrate deploy` would fire it on production automatically the moment
-- main is promoted, with no dry run and no way back.
--
-- Idempotent: safe to re-run, and safe on a database where someone already made it.

INSERT INTO "tenant" ("id", "slug", "name", "status", "plan", "createdAt", "updatedAt")
VALUES (
  'platform',
  'platform',
  'Assess360 Platform',
  'ACTIVE',
  -- SCALE, not FREE. The platform is never metered or feature-gated against itself;
  -- resolvePlan() short-circuits it to unlimited limits regardless. This value is
  -- belt-and-braces so that any future code path reading the column directly — a
  -- report, an admin list, a gate written later — still sees "highest tier" rather
  -- than accidentally gating the platform off its own features.
  'SCALE',
  NOW(),
  NOW()
)
ON CONFLICT ("id") DO NOTHING;

-- A database where 'platform' was taken as a SLUG by something else would silently
-- skip the insert above on the slug's unique index rather than the id, leaving no
-- platform row at all. Fail loudly instead of booting into a broken state.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "tenant" WHERE "id" = 'platform') THEN
    RAISE EXCEPTION 'Platform tenant row could not be created: the slug "platform" is already taken by tenant id %',
      (SELECT "id" FROM "tenant" WHERE "slug" = 'platform');
  END IF;
END $$;
