-- Coexistence sync: record that contacts and chat history were ASKED for.
--
-- Additive and nullable. Nothing reads these until a coexistence number exists, and a
-- null means "never asked", which is the correct starting state for every existing row.
--
-- The stamps exist because Meta allows each sync ONCE per onboarding, inside about 24
-- hours. Without a record of having asked, the only way to discover that a second
-- press is refused would be to spend somebody's single attempt on finding out.
ALTER TABLE "app_setting" ADD COLUMN "wabaContactsSyncAt" TIMESTAMP(3);
ALTER TABLE "app_setting" ADD COLUMN "wabaHistorySyncAt" TIMESTAMP(3);
ALTER TABLE "app_setting" ADD COLUMN "wabaSyncError" TEXT;
