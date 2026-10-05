-- AI moves from "every tenant brings an API key" to "the platform runs the model".
--
-- The key and the provider live on the singleton row; this adds the two things that
-- decide WHICH model a tenant's statements are generated with, as data rather than as
-- constants: a per-plan binding on the singleton, and a per-tenant override.
--
-- Both nullable, both read with a code default, so an empty column is a working
-- configuration rather than a broken one.
ALTER TABLE "app_setting" ADD COLUMN "aiPlanModels" JSONB;
ALTER TABLE "tenant" ADD COLUMN "aiModelOverride" TEXT;
