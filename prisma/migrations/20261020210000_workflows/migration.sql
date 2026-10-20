-- Workflows: a sequence of messages to a person, over time.
--
-- Separate from the automation tables on purpose. automation_run is welded to an
-- appointmentId and fires one rule at one moment; a workflow walks one PERSON through
-- ordered steps with delays between them and a draft state before any of it is live.
-- The two engines share the sender and the suppression check, not the queue.

CREATE TYPE "WorkflowTrigger" AS ENUM ('CONTACT_OPTED_IN', 'ASSESSMENT_COMPLETED', 'GATE_QUALIFIED', 'BAND_REACHED', 'TAG_ADDED');
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED');
CREATE TYPE "WorkflowStepKind" AS ENUM ('MESSAGE', 'DELAY', 'TAG');
CREATE TYPE "WorkflowChannel" AS ENUM ('EMAIL', 'WABA');
CREATE TYPE "WorkflowDelayUnit" AS ENUM ('MINUTES', 'HOURS', 'DAYS', 'MONTHS');
CREATE TYPE "WorkflowTagAction" AS ENUM ('ADD', 'REMOVE');
CREATE TYPE "WorkflowRunStatus" AS ENUM ('PENDING', 'SENDING', 'DONE', 'FAILED', 'CANCELLED');

CREATE TABLE "workflow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" "WorkflowTrigger" NOT NULL,
    -- DRAFT, so a workflow cannot send anything the moment it is created.
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    -- Plain ids, not foreign keys: a deleted funnel or tag must quieten a workflow,
    -- never delete it and never silently widen it to every funnel.
    "assessmentId" TEXT,
    "bandKey" TEXT,
    "triggerTagId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workflow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workflow_tenantId_idx" ON "workflow"("tenantId");
CREATE INDEX "workflow_trigger_status_idx" ON "workflow"("trigger", "status");

CREATE TABLE "workflow_step" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "kind" "WorkflowStepKind" NOT NULL,
    "channel" "WorkflowChannel",
    "subject" TEXT,
    "body" TEXT,
    "wabaTemplate" TEXT,
    "wabaLang" TEXT NOT NULL DEFAULT 'en',
    "wabaVars" JSONB,
    -- Amount and unit, never flattened to minutes: a calendar month is not 43,200.
    "delayAmount" INTEGER,
    "delayUnit" "WorkflowDelayUnit",
    "tagId" TEXT,
    "tagAction" "WorkflowTagAction",
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workflow_step_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workflow_step_workflowId_displayOrder_idx" ON "workflow_step"("workflowId", "displayOrder");

CREATE TABLE "workflow_run" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectId" TEXT,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "stopReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workflow_run_pkey" PRIMARY KEY ("id")
);

-- One run per person per workflow, forever: a second opt-in must not put somebody
-- three days into a sequence back at the start.
CREATE UNIQUE INDEX "workflow_run_workflowId_contactId_key" ON "workflow_run"("workflowId", "contactId");
-- The worker query is "what is due", so it is one index.
CREATE INDEX "workflow_run_status_dueAt_idx" ON "workflow_run"("status", "dueAt");
CREATE INDEX "workflow_run_tenantId_startedAt_idx" ON "workflow_run"("tenantId", "startedAt");

CREATE TABLE "workflow_send" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "contactId" TEXT,
    "channel" "WorkflowChannel" NOT NULL,
    "status" TEXT NOT NULL,
    "toAddress" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_send_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workflow_send_tenantId_createdAt_idx" ON "workflow_send"("tenantId", "createdAt");
CREATE INDEX "workflow_send_stepId_idx" ON "workflow_send"("stepId");

ALTER TABLE "workflow" ADD CONSTRAINT "workflow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_step" ADD CONSTRAINT "workflow_step_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_send" ADD CONSTRAINT "workflow_send_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_send" ADD CONSTRAINT "workflow_send_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "workflow_step"("id") ON DELETE CASCADE ON UPDATE CASCADE;
