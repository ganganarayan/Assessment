-- GOOGLE CALENDAR: one connection per CALENDAR, and the platform's OAuth app.
--
-- google_calendar_account shipped with the calendar as a reserved, never-read table, so
-- there is nothing in it anywhere and this reshapes it freely. It was keyed one row per
-- WORKSPACE, which stopped being right the day calendars became per staff member: four
-- people each connect their own Google, and a workspace-wide row cannot say whose.
--
-- 🔴 calendarKey is NOT NULL and holds the literal 'shared' for the workspace calendar.
-- A nullable userId in the unique index would NOT work: Postgres treats NULLs as
-- distinct, so (tenant, NULL) could be inserted twice and one calendar would end up
-- connected to two Google accounts, writing every event to both. The same trap as
-- appointment.slotLock, solved the same way.
--
-- The OAuth client lives on the PLATFORM settings row. Not per tenant, because a tenant
-- has no Google Cloud project and should never be asked for one; not in the
-- environment, because an env edit plus a redeploy is not a setting.
-- DropIndex
DROP INDEX "google_calendar_account_tenantId_key";

-- AlterTable
ALTER TABLE "app_setting" ADD COLUMN     "googleClientId" TEXT,
ADD COLUMN     "googleClientSecretEnc" TEXT;

-- AlterTable
-- Added WITH a default and then stripped of it: the table has never been written to by
-- anything, but a NOT NULL column with no default is a migration that fails the moment
-- that assumption is wrong, and "shared" is the correct value for any row that exists.
ALTER TABLE "google_calendar_account" ADD COLUMN     "calendarKey" TEXT NOT NULL DEFAULT 'shared',
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "calendarId" SET DEFAULT 'primary';

-- CreateIndex
CREATE INDEX "google_calendar_account_tenantId_idx" ON "google_calendar_account"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_account_tenantId_calendarKey_key" ON "google_calendar_account"("tenantId", "calendarKey");

-- AddForeignKey
ALTER TABLE "google_calendar_account" ADD CONSTRAINT "google_calendar_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The default was scaffolding for the backfill, not part of the model.
ALTER TABLE "google_calendar_account" ALTER COLUMN "calendarKey" DROP DEFAULT;
