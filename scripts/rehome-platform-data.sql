-- ===========================================================================
-- Tenancy inspection queries — READ ONLY.
--
-- This file used to also PERFORM the re-home in SQL, as a twin of
-- `npm run rehome`. That half has been removed, deliberately:
--
--   * It listed 14 tables when 16 carry a nullable tenant column. It was
--     missing gate_entry and funnel_event_count, so a run that reported
--     success would have left both tables pointing at nobody — the gate
--     counters and the per-day funnel-event counters silently detached from
--     the funnel they belong to, and discovered much later by the NOT NULL
--     migration failing on tables nobody was watching.
--   * It could not run the preflight. The re-home's real risk is not the
--     UPDATE — it is moving a funnel onto a tenant whose plan lacks CAPI, or
--     whose integration values only ever lived in environment variables. Both
--     produce a funnel that looks perfectly healthy in the admin and silently
--     stops earning. `npm run rehome` blocks on exactly that; a hand-run SQL
--     script cannot.
--
-- TO PERFORM THE MOVE, use the tool. It dry-runs by default, reconciles
-- per-table counts before against after, and writes a manifest that reverts
-- exactly:
--
--   npm run verify:tenancy -- --funnel apply-gita     # where things stand
--   npm run settings:from-env                        # close the env gaps
--   npm run rehome -- --platform                     # owner + platform row
--   npm run rehome -- --platform --apply
--   npm run rehome -- --tenant apply-gita            # the funnel
--   npm run rehome -- --tenant apply-gita --apply
--   npm run rehome -- --revert .rehome/<file>.json   # exact undo
--
-- Prefix each with `railway run` (add `--environment production` for prod).
--
-- What remains below are the read-only queries, which are genuinely handy in
-- the Railway Postgres console when you want to look without installing
-- anything. Column note: Prisma kept camelCase column names, so "tenantId"
-- MUST be double-quoted; table names are snake_case and singular.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Which tenants exist, and which one is the platform.
-- ---------------------------------------------------------------------------
SELECT id, slug, name, plan, status
FROM tenant
ORDER BY ("id" = 'platform') DESC, "createdAt";

-- ---------------------------------------------------------------------------
-- How many rows are still unowned, per table.
--
-- This is the complete set of models with a nullable tenant column. Every row
-- counted here is a row the later NOT NULL migration will reject. To confirm
-- the list still matches the schema:
--   awk '/^model /{m=$2} /tenantId +String\?/{print m}' prisma/schema.prisma
-- ---------------------------------------------------------------------------
            SELECT 'assessment'            AS tbl, count(*) FROM assessment            WHERE "tenantId" IS NULL
UNION ALL   SELECT 'submission',                   count(*) FROM submission            WHERE "tenantId" IS NULL
UNION ALL   SELECT 'payment',                      count(*) FROM payment               WHERE "tenantId" IS NULL
UNION ALL   SELECT 'capi_log',                     count(*) FROM capi_log              WHERE "tenantId" IS NULL
UNION ALL   SELECT 'event_log',                    count(*) FROM event_log             WHERE "tenantId" IS NULL
UNION ALL   SELECT 'page_view',                    count(*) FROM page_view             WHERE "tenantId" IS NULL
UNION ALL   SELECT 'cta_click',                    count(*) FROM cta_click             WHERE "tenantId" IS NULL
UNION ALL   SELECT 'gate_entry',                   count(*) FROM gate_entry            WHERE "tenantId" IS NULL
UNION ALL   SELECT 'gate_disqualification',        count(*) FROM gate_disqualification WHERE "tenantId" IS NULL
UNION ALL   SELECT 'funnel_event_count',           count(*) FROM funnel_event_count     WHERE "tenantId" IS NULL
UNION ALL   SELECT 'nurture_log',                  count(*) FROM nurture_log           WHERE "tenantId" IS NULL
UNION ALL   SELECT 'webhook',                      count(*) FROM webhook               WHERE "tenantId" IS NULL
UNION ALL   SELECT 'webhook_log',                  count(*) FROM webhook_log           WHERE "tenantId" IS NULL
UNION ALL   SELECT 'webhook_delivery',             count(*) FROM webhook_delivery       WHERE "tenantId" IS NULL
UNION ALL   SELECT 'api_token',                    count(*) FROM api_token             WHERE "tenantId" IS NULL
UNION ALL   SELECT 'ai_prompt_version',            count(*) FROM ai_prompt_version      WHERE "tenantId" IS NULL
-- Handled by `--platform`, not by the funnel move. Other users legitimately have
-- no tenant until they provision one, so a non-zero count here is not a fault.
UNION ALL   SELECT 'user (informational)',         count(*) FROM "user"                WHERE "tenantId" IS NULL
UNION ALL   SELECT 'app_setting (informational)',  count(*) FROM app_setting           WHERE "tenantId" IS NULL
ORDER BY 1;

-- ---------------------------------------------------------------------------
-- The owner's account. The ROLE is what grants the platform console; the tenant
-- does not, which is why the DB backstop guards the role and permits the tenant.
-- ---------------------------------------------------------------------------
SELECT id, email, role, "tenantId", "deletedAt"
FROM "user"
-- The default owner email; PLATFORM_OWNER_EMAIL overrides it, so check the service's
-- variables if this returns no row.
WHERE lower(email) = lower('ganganarayan.rns@gmail.com');

-- ---------------------------------------------------------------------------
-- Is the funnel tenant's integration config actually present?
--
-- A tenant NEVER falls back to environment variables — that fallback exists for
-- the platform scope only. So a blank here after the move means no pixel, no
-- CAPI, or a checkout that cannot sign an order, with nothing in the admin
-- looking wrong. Secrets are shown as booleans; never select the ciphertext.
-- ---------------------------------------------------------------------------
SELECT
  t.slug,
  s."metaPixelId",
  (s."metaCapiTokenEnc"          IS NOT NULL) AS has_capi_token,
  s."razorpayKeyId",
  (s."razorpayKeySecretEnc"      IS NOT NULL) AS has_rzp_secret,
  (s."razorpayWebhookSecretEnc"  IS NOT NULL) AS has_rzp_webhook_secret
FROM tenant t
LEFT JOIN app_setting s ON s."tenantId" = t.id
ORDER BY (t.id = 'platform') DESC, t.slug;
