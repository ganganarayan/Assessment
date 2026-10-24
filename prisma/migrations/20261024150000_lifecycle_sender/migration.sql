-- LIFECYCLE PHASE 2: the sender's master switch, and the way out.
--
-- The token is added in three steps rather than as one NOT NULL column with a
-- client-side default. Prisma's own generated form fails the moment the table has a
-- row in it, and "it is empty on staging today" is not a thing to bet a production
-- deploy on.

-- AlterTable
ALTER TABLE "app_setting" ADD COLUMN "lifecycleLive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "lifecycle_profile" ADD COLUMN "optOutToken" TEXT;

-- Backfill every existing row with its own token before the column is locked down.
UPDATE "lifecycle_profile"
SET "optOutToken" = md5(random()::text || clock_timestamp()::text || "id")
WHERE "optOutToken" IS NULL;

ALTER TABLE "lifecycle_profile" ALTER COLUMN "optOutToken" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "lifecycle_profile_optOutToken_key" ON "lifecycle_profile"("optOutToken");
