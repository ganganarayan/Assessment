-- ===========================================================================
-- Re-home platform (null-tenant) data into a tenant.
--
-- Same job as `npm run rehome`, as plain SQL for the Railway Postgres console
-- or psql. Run the STEP 0 checks first, then STEP 1-3 as one transaction.
--
-- Column note: Prisma kept camelCase column names, so "tenantId" MUST be
-- double-quoted. Table names are snake_case and singular.
--
-- NOT MOVED, on purpose:
--   * "user"      - the owner row stays SUPER_ADMIN with tenantId NULL.
--                   Attaching the owner to a tenant is what caused the
--                   21 Sept lockout.
--   * app_setting - the singleton stays as the PLATFORM row; STEP 3 COPIES it
--                   to the tenant instead. Tenants never fall back to env for
--                   pixel/CAPI/Razorpay/AI, so a tenant without these values
--                   has a dark funnel.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- STEP 0 - checks. Run these FIRST and read the output.
-- ---------------------------------------------------------------------------

-- 0a. The target tenant must exist. Note its id.
SELECT id, slug, name FROM tenant ORDER BY "createdAt";

-- 0b. How much moves.
SELECT 'assessment' AS tbl, count(*) FROM assessment WHERE "tenantId" IS NULL
UNION ALL SELECT 'submission',           count(*) FROM submission           WHERE "tenantId" IS NULL
UNION ALL SELECT 'payment',              count(*) FROM payment              WHERE "tenantId" IS NULL
UNION ALL SELECT 'capi_log',             count(*) FROM capi_log             WHERE "tenantId" IS NULL
UNION ALL SELECT 'event_log',            count(*) FROM event_log            WHERE "tenantId" IS NULL
UNION ALL SELECT 'page_view',            count(*) FROM page_view            WHERE "tenantId" IS NULL
UNION ALL SELECT 'cta_click',            count(*) FROM cta_click            WHERE "tenantId" IS NULL
UNION ALL SELECT 'gate_disqualification',count(*) FROM gate_disqualification WHERE "tenantId" IS NULL
UNION ALL SELECT 'nurture_log',          count(*) FROM nurture_log          WHERE "tenantId" IS NULL
UNION ALL SELECT 'webhook',              count(*) FROM webhook              WHERE "tenantId" IS NULL
UNION ALL SELECT 'webhook_log',          count(*) FROM webhook_log          WHERE "tenantId" IS NULL
UNION ALL SELECT 'webhook_delivery',     count(*) FROM webhook_delivery     WHERE "tenantId" IS NULL
UNION ALL SELECT 'api_token',            count(*) FROM api_token            WHERE "tenantId" IS NULL
UNION ALL SELECT 'ai_prompt_version',    count(*) FROM ai_prompt_version    WHERE "tenantId" IS NULL;

-- 0c. THE IMPORTANT ONE. Does the platform row actually hold the keys, or is
--     the funnel running on env vars? Blank here + blank on the tenant row
--     = the moved funnel has no pixel, no CAPI and a checkout that cannot
--     sign an order.
SELECT
  "tenantId" IS NULL                        AS is_platform_row,
  "metaPixelId"              IS NOT NULL    AS has_pixel,
  "metaCapiTokenEnc"         IS NOT NULL    AS has_capi_token,
  "razorpayKeyId"            IS NOT NULL    AS has_rzp_key,
  "razorpayKeySecretEnc"     IS NOT NULL    AS has_rzp_secret,
  "razorpayWebhookSecretEnc" IS NOT NULL    AS has_rzp_webhook_secret
FROM app_setting;

-- 0d. Does the tenant already have an app_setting row? Decides STEP 3.
SELECT count(*) AS tenant_setting_rows
FROM app_setting WHERE "tenantId" = (SELECT id FROM tenant WHERE slug = 'apply-gita');

-- 0e. THE OTHER IMPORTANT ONE. The null scope is unmetered with every feature
--     on; a tenant is not. The billing gates start applying the moment these
--     rows belong to a tenant. On FREE (the default) that means:
--       * capi = false          -> Meta CAPI silently stops firing
--       * 25 responses / month  -> respondents captured but LOCKED past that
--       * 1 assessment          -> no new ones can be created
--       * qualificationGate, conditionalRouting, heatmap, apiAccess all off
--     Only GROWTH and SCALE carry capi.
SELECT t.slug, t.plan AS tenant_plan, s.plan AS subscription_plan, s.status
FROM tenant t LEFT JOIN subscription s ON s."tenantId" = t.id;

-- FIX BEFORE MOVING, if 0e shows FREE or STARTER. SCALE = every feature,
-- unlimited assessments, 12000 responses/month (raise via subscription
-- limitOverrides if the real monthly volume is higher than that).
-- UPDATE tenant SET plan = 'SCALE' WHERE slug = 'apply-gita';


-- ---------------------------------------------------------------------------
-- STEP 1-3 - the migration. One transaction; nothing is half-applied.
-- Change 'apply-gita' below if the slug differs.
-- ---------------------------------------------------------------------------
BEGIN;

-- STEP 1. Record exactly which rows we are about to touch. This IS the undo:
-- without it, a rollback cannot tell moved rows from rows the tenant already
-- owned.
CREATE TABLE IF NOT EXISTS rehome_backup (
  tbl      text        NOT NULL,
  id       text        NOT NULL,
  moved_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO rehome_backup (tbl, id)
            SELECT 'assessment',            id FROM assessment            WHERE "tenantId" IS NULL
  UNION ALL SELECT 'submission',            id FROM submission            WHERE "tenantId" IS NULL
  UNION ALL SELECT 'payment',               id FROM payment               WHERE "tenantId" IS NULL
  UNION ALL SELECT 'capi_log',              id FROM capi_log              WHERE "tenantId" IS NULL
  UNION ALL SELECT 'event_log',             id FROM event_log             WHERE "tenantId" IS NULL
  UNION ALL SELECT 'page_view',             id FROM page_view             WHERE "tenantId" IS NULL
  UNION ALL SELECT 'cta_click',             id FROM cta_click             WHERE "tenantId" IS NULL
  UNION ALL SELECT 'gate_disqualification', id FROM gate_disqualification WHERE "tenantId" IS NULL
  UNION ALL SELECT 'nurture_log',           id FROM nurture_log           WHERE "tenantId" IS NULL
  UNION ALL SELECT 'webhook',               id FROM webhook               WHERE "tenantId" IS NULL
  UNION ALL SELECT 'webhook_log',           id FROM webhook_log           WHERE "tenantId" IS NULL
  UNION ALL SELECT 'webhook_delivery',      id FROM webhook_delivery      WHERE "tenantId" IS NULL
  UNION ALL SELECT 'api_token',             id FROM api_token             WHERE "tenantId" IS NULL
  UNION ALL SELECT 'ai_prompt_version',     id FROM ai_prompt_version     WHERE "tenantId" IS NULL;

-- STEP 2. Move.
UPDATE assessment            SET "tenantId" = (SELECT id FROM tenant WHERE slug = 'apply-gita') WHERE "tenantId" IS NULL;
UPDATE submission            SET "tenantId" = (SELECT id FROM tenant WHERE slug = 'apply-gita') WHERE "tenantId" IS NULL;
UPDATE payment               SET "tenantId" = (SELECT id FROM tenant WHERE slug = 'apply-gita') WHERE "tenantId" IS NULL;
UPDATE capi_log              SET "tenantId" = (SELECT id FROM tenant WHERE slug = 'apply-gita') WHERE "tenantId" IS NULL;
UPDATE event_log             SET "tenantId" = (SELECT id FROM tenant WHERE slug = 'apply-gita') WHERE "tenantId" IS NULL;
UPDATE page_view             SET "tenantId" = (SELECT id FROM tenant WHERE slug = 'apply-gita') WHERE "tenantId" IS NULL;
UPDATE cta_click             SET "tenantId" = (SELECT id FROM tenant WHERE slug = 'apply-gita') WHERE "tenantId" IS NULL;
UPDATE gate_disqualification SET "tenantId" = (SELECT id FROM tenant WHERE slug = 'apply-gita') WHERE "tenantId" IS NULL;
UPDATE nurture_log           SET "tenantId" = (SELECT id FROM tenant WHERE slug = 'apply-gita') WHERE "tenantId" IS NULL;
UPDATE webhook               SET "tenantId" = (SELECT id FROM tenant WHERE slug = 'apply-gita') WHERE "tenantId" IS NULL;
UPDATE webhook_log           SET "tenantId" = (SELECT id FROM tenant WHERE slug = 'apply-gita') WHERE "tenantId" IS NULL;
UPDATE webhook_delivery      SET "tenantId" = (SELECT id FROM tenant WHERE slug = 'apply-gita') WHERE "tenantId" IS NULL;
UPDATE api_token             SET "tenantId" = (SELECT id FROM tenant WHERE slug = 'apply-gita') WHERE "tenantId" IS NULL;
UPDATE ai_prompt_version     SET "tenantId" = (SELECT id FROM tenant WHERE slug = 'apply-gita') WHERE "tenantId" IS NULL;

-- STEP 3. Settings. Run 3A only if STEP 0d returned 0, else 3B.

-- 3A. Tenant has NO app_setting row -> clone the platform row wholesale
--     (every column, including the encrypted secrets, which stay valid because
--     the encryption key is BETTER_AUTH_SECRET and that is unchanged).
CREATE TEMP TABLE _s ON COMMIT DROP AS SELECT * FROM app_setting WHERE "tenantId" IS NULL;
UPDATE _s
   SET id         = 'set_' || (SELECT id FROM tenant WHERE slug = 'apply-gita'),
       "tenantId" = (SELECT id FROM tenant WHERE slug = 'apply-gita');
INSERT INTO app_setting SELECT * FROM _s;

-- 3B. Tenant ALREADY has a row -> fill only the blanks, never overwrite a
--     value the tenant already set. (Comment out 3A above if you use this.)
-- UPDATE app_setting t SET
--   "metaPixelId"              = COALESCE(t."metaPixelId",              s."metaPixelId"),
--   "metaCapiTokenEnc"         = COALESCE(t."metaCapiTokenEnc",         s."metaCapiTokenEnc"),
--   "razorpayKeyId"            = COALESCE(t."razorpayKeyId",            s."razorpayKeyId"),
--   "razorpayKeySecretEnc"     = COALESCE(t."razorpayKeySecretEnc",     s."razorpayKeySecretEnc"),
--   "razorpayWebhookSecretEnc" = COALESCE(t."razorpayWebhookSecretEnc", s."razorpayWebhookSecretEnc"),
--   "aiEnabled"                = t."aiEnabled" OR s."aiEnabled",
--   "aiProvider"               = COALESCE(t."aiProvider",               s."aiProvider"),
--   "aiClaudeKeyEnc"           = COALESCE(t."aiClaudeKeyEnc",           s."aiClaudeKeyEnc"),
--   "aiOpenAiKeyEnc"           = COALESCE(t."aiOpenAiKeyEnc",           s."aiOpenAiKeyEnc"),
--   "aiGeminiKeyEnc"           = COALESCE(t."aiGeminiKeyEnc",           s."aiGeminiKeyEnc"),
--   "aiGuidance"               = COALESCE(t."aiGuidance",               s."aiGuidance"),
--   "smtpHost"                 = COALESCE(t."smtpHost",                 s."smtpHost"),
--   "smtpPort"                 = COALESCE(t."smtpPort",                 s."smtpPort"),
--   "smtpUser"                 = COALESCE(t."smtpUser",                 s."smtpUser"),
--   "smtpPassEnc"              = COALESCE(t."smtpPassEnc",              s."smtpPassEnc"),
--   "smtpFromName"             = COALESCE(t."smtpFromName",             s."smtpFromName"),
--   "smtpFromEmail"            = COALESCE(t."smtpFromEmail",            s."smtpFromEmail"),
--   "bookingUrl"               = COALESCE(t."bookingUrl",               s."bookingUrl")
-- FROM app_setting s
-- WHERE s."tenantId" IS NULL
--   AND t."tenantId" = (SELECT id FROM tenant WHERE slug = 'apply-gita');

COMMIT;


-- ---------------------------------------------------------------------------
-- VERIFY - all of these should now report the tenant id, and nothing NULL.
-- ---------------------------------------------------------------------------
SELECT 'assessment' AS tbl, "tenantId", count(*) FROM assessment GROUP BY 2
UNION ALL SELECT 'submission', "tenantId", count(*) FROM submission GROUP BY 2
UNION ALL SELECT 'event_log',  "tenantId", count(*) FROM event_log  GROUP BY 2
ORDER BY 1, 2;

-- The owner MUST still be SUPER_ADMIN with a NULL tenant.
SELECT email, role, "tenantId" FROM "user" WHERE role = 'SUPER_ADMIN';

-- The tenant now has a settings row carrying the keys.
SELECT "tenantId", "metaPixelId" IS NOT NULL AS has_pixel,
       "razorpayKeyId" IS NOT NULL AS has_rzp
FROM app_setting;


-- ---------------------------------------------------------------------------
-- ROLLBACK (after COMMIT) - puts back exactly the rows that were moved.
-- ---------------------------------------------------------------------------
-- BEGIN;
-- UPDATE assessment            SET "tenantId" = NULL WHERE id IN (SELECT id FROM rehome_backup WHERE tbl = 'assessment');
-- UPDATE submission            SET "tenantId" = NULL WHERE id IN (SELECT id FROM rehome_backup WHERE tbl = 'submission');
-- UPDATE payment               SET "tenantId" = NULL WHERE id IN (SELECT id FROM rehome_backup WHERE tbl = 'payment');
-- UPDATE capi_log              SET "tenantId" = NULL WHERE id IN (SELECT id FROM rehome_backup WHERE tbl = 'capi_log');
-- UPDATE event_log             SET "tenantId" = NULL WHERE id IN (SELECT id FROM rehome_backup WHERE tbl = 'event_log');
-- UPDATE page_view             SET "tenantId" = NULL WHERE id IN (SELECT id FROM rehome_backup WHERE tbl = 'page_view');
-- UPDATE cta_click             SET "tenantId" = NULL WHERE id IN (SELECT id FROM rehome_backup WHERE tbl = 'cta_click');
-- UPDATE gate_disqualification SET "tenantId" = NULL WHERE id IN (SELECT id FROM rehome_backup WHERE tbl = 'gate_disqualification');
-- UPDATE nurture_log           SET "tenantId" = NULL WHERE id IN (SELECT id FROM rehome_backup WHERE tbl = 'nurture_log');
-- UPDATE webhook               SET "tenantId" = NULL WHERE id IN (SELECT id FROM rehome_backup WHERE tbl = 'webhook');
-- UPDATE webhook_log           SET "tenantId" = NULL WHERE id IN (SELECT id FROM rehome_backup WHERE tbl = 'webhook_log');
-- UPDATE webhook_delivery      SET "tenantId" = NULL WHERE id IN (SELECT id FROM rehome_backup WHERE tbl = 'webhook_delivery');
-- UPDATE api_token             SET "tenantId" = NULL WHERE id IN (SELECT id FROM rehome_backup WHERE tbl = 'api_token');
-- UPDATE ai_prompt_version     SET "tenantId" = NULL WHERE id IN (SELECT id FROM rehome_backup WHERE tbl = 'ai_prompt_version');
-- DELETE FROM app_setting WHERE "tenantId" = (SELECT id FROM tenant WHERE slug = 'apply-gita');  -- only if 3A created it
-- COMMIT;
