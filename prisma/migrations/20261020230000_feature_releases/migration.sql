-- Feature release switches: one row per releasable feature, platform-wide.
--
-- Seeded for the five keys that exist today, so the platform console shows real rows
-- with real dates rather than inferring them. A key with no row falls back to the
-- default in lib/features/catalog.ts, which is what keeps a later code-only key safe
-- until its seed lands.

CREATE TABLE "feature_release" (
    "key" TEXT NOT NULL,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "releasedAt" TIMESTAMP(3),
    "changedByUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_release_pkey" PRIMARY KEY ("key")
);

-- Already live for customers before this table existed. Seeded ON, because the switch
-- must not be the thing that takes a working feature away from the workspaces using it.
INSERT INTO "feature_release" ("key", "released", "releasedAt", "note")
VALUES
    ('automations', true, CURRENT_TIMESTAMP, 'Already live before release switches existed.'),
    ('calendar',    true, CURRENT_TIMESTAMP, 'Already live before release switches existed.'),
    ('contacts',    true, CURRENT_TIMESTAMP, 'Already live before release switches existed.')
ON CONFLICT ("key") DO NOTHING;

-- The engine ships before its screens do, so it starts held back.
INSERT INTO "feature_release" ("key", "released", "note")
VALUES ('workflows', false, 'Engine only - no tenant screens yet.')
ON CONFLICT ("key") DO NOTHING;

-- WhatsApp carries over the switch it already had (AppSetting.wabaEnabledGlobal on the
-- singleton row), so whatever state the owner left it in is preserved exactly. No
-- singleton row means no insert, and the catalog default (off) applies - which is the
-- same answer the old column's default gave.
INSERT INTO "feature_release" ("key", "released", "releasedAt", "note")
SELECT
    'whatsapp',
    COALESCE(a."wabaEnabledGlobal", false),
    CASE WHEN COALESCE(a."wabaEnabledGlobal", false) THEN CURRENT_TIMESTAMP ELSE NULL END,
    'Carried over from the WhatsApp park switch.'
FROM "app_setting" a
WHERE a."id" = 'singleton'
ON CONFLICT ("key") DO NOTHING;
