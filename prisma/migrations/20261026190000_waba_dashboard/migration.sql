-- The WABA dashboard snapshot.
--
-- One nullable JSON column. Null means nobody has asked Meta yet, which is the right
-- starting state for every row and is what the screen shows as "never".
ALTER TABLE "app_setting" ADD COLUMN "wabaDashboard" JSONB;
