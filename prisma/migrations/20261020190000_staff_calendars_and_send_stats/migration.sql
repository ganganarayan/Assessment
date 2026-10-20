-- Three things that arrive together because they are one migration's worth of columns:
--
-- 1. PER-STAFF CALENDARS. booking_type.assignedUserId says whose time a link sells and
--    appointment.assignedUserId says whose diary a booking landed in. Both nullable, and
--    null means the workspace's shared calendar - which is exactly what every existing
--    link and booking already is, so nothing has to be backfilled and no behaviour
--    changes for a one-person workspace.
--
-- 2. PER-MESSAGE STATS. Lifetime counters on automation_action, plus automation_send:
--    one row per delivery attempt, keyed on the ACTION so a message keeps its numbers
--    when its wording is edited.
--
-- 3. RETENTION. automation_send carries an index on createdAt alone, which is what the
--    30-day sweep deletes by. automation_run already has (status, dueAt); its sweep uses
-- CreateEnum
CREATE TYPE "AutomationSendStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "automation_action" ADD COLUMN     "clickCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "skippedCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "automation_send" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "runId" TEXT,
    "channel" "AutomationChannel" NOT NULL,
    "status" "AutomationSendStatus" NOT NULL,
    "toAddress" TEXT,
    "error" TEXT,
    "nurtureLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_send_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_send_actionId_createdAt_idx" ON "automation_send"("actionId", "createdAt");

-- CreateIndex
CREATE INDEX "automation_send_tenantId_createdAt_idx" ON "automation_send"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "automation_send_createdAt_idx" ON "automation_send"("createdAt");

-- AddForeignKey
ALTER TABLE "booking_type" ADD CONSTRAINT "booking_type_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_send" ADD CONSTRAINT "automation_send_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_send" ADD CONSTRAINT "automation_send_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "automation_action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

