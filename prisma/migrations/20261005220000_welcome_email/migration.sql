-- Welcome email for a new workspace, stored as an editable template on the singleton
-- row rather than written into the code, so the owner can change what new customers
-- are told without a deploy.
--
-- Defaults OFF. Turning it on is a deliberate act, because the first thing a new
-- customer receives is not something that should start sending itself the moment a
-- column exists.
ALTER TABLE "app_setting" ADD COLUMN "welcomeEmailEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_setting" ADD COLUMN "welcomeEmailSubject" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "welcomeEmailBody" TEXT;
