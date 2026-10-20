-- AUTOMATION: trigger, then actions.
--
-- Additive and empty on arrival: no workspace has an automation, so nothing sends
-- anything differently until somebody creates one.
--
-- The one thing worth reading before changing it: automation_run is UNIQUE on
-- (automationId, appointmentId). One row per automation per appointment, forever. A
-- re-emitted event updates that row instead of queueing a second reminder, and a
-- rescheduled call moves its due time rather than sending twice. The index on
-- (status, dueAt) is what the cron claims work with.
-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('APPOINTMENT_BOOKED', 'APPOINTMENT_RESCHEDULED', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_ATTENDED', 'APPOINTMENT_NO_SHOW', 'APPOINTMENT_REMINDER');

-- CreateEnum
CREATE TYPE "AutomationChannel" AS ENUM ('EMAIL', 'WABA');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateTable
CREATE TABLE "automation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "bookingTypeId" TEXT,
    "offsetMin" INTEGER NOT NULL DEFAULT -1440,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_action" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "channel" "AutomationChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "wabaTemplate" TEXT,
    "wabaLang" TEXT NOT NULL DEFAULT 'en',
    "wabaVars" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_run" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "firedAt" TIMESTAMP(3),
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_tenantId_idx" ON "automation"("tenantId");

-- CreateIndex
CREATE INDEX "automation_trigger_active_idx" ON "automation"("trigger", "active");

-- CreateIndex
CREATE INDEX "automation_action_automationId_displayOrder_idx" ON "automation_action"("automationId", "displayOrder");

-- CreateIndex
CREATE INDEX "automation_run_status_dueAt_idx" ON "automation_run"("status", "dueAt");

-- CreateIndex
CREATE INDEX "automation_run_tenantId_createdAt_idx" ON "automation_run"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "automation_run_automationId_appointmentId_key" ON "automation_run"("automationId", "appointmentId");

-- AddForeignKey
ALTER TABLE "automation" ADD CONSTRAINT "automation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation" ADD CONSTRAINT "automation_bookingTypeId_fkey" FOREIGN KEY ("bookingTypeId") REFERENCES "booking_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_action" ADD CONSTRAINT "automation_action_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

