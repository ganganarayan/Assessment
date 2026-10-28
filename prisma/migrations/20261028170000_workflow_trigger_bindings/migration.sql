-- MANY WAYS INTO ONE SEQUENCE.
--
-- A workflow had exactly one trigger, and the parameters that narrow it (which funnel,
-- which band, which tag) lived on the workflow itself. That only works while there is
-- one way in: "tag added: hot lead" and "band reached: HIGH" in the same sequence each
-- need their own parameter, and one pair of columns cannot say which belongs to which.
--
-- So the trigger and its parameters move to a child row, one per trigger box on the
-- canvas. Every existing workflow becomes a workflow with exactly one box, which is
-- what it already was.

CREATE TABLE "workflow_trigger_binding" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "trigger" "WorkflowTrigger" NOT NULL,
    -- Plain ids, not foreign keys, for the same reason they were plain on the workflow:
    -- a deleted funnel or tag must quieten a trigger box, never delete it and never
    -- silently widen it to every funnel.
    "assessmentId" TEXT,
    "bandKey" TEXT,
    "tagId" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_trigger_binding_pkey" PRIMARY KEY ("id")
);

-- The matcher's index: every incoming event asks which boxes watch this trigger.
CREATE INDEX "workflow_trigger_binding_trigger_idx" ON "workflow_trigger_binding"("trigger");
CREATE INDEX "workflow_trigger_binding_workflowId_displayOrder_idx"
    ON "workflow_trigger_binding"("workflowId", "displayOrder");

ALTER TABLE "workflow_trigger_binding"
    ADD CONSTRAINT "workflow_trigger_binding_workflowId_fkey"
    FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 🔴 BACKFILL BEFORE THE DROP, in this same transaction. Every published workflow is
-- live: a deploy that dropped the column first and copied afterwards would leave a
-- window where no event matches anything, and the people who triggered during it are
-- not queued anywhere to be caught up later.
INSERT INTO "workflow_trigger_binding" ("id", "workflowId", "trigger", "assessmentId", "bandKey", "tagId", "displayOrder", "createdAt")
SELECT
    'wtb_' || "id",
    "id",
    "trigger",
    "assessmentId",
    "bandKey",
    "triggerTagId",
    0,
    "createdAt"
FROM "workflow";

-- Re-entry, per workflow. TRUE is what every row written before this meant, so no
-- existing sequence changes behaviour on deploy. The toggle is what makes several
-- triggers safe: see the column comment in schema.prisma.
ALTER TABLE "workflow" ADD COLUMN "allowReentry" BOOLEAN NOT NULL DEFAULT true;

-- Which box enrolled this person. Nullable: every run that already exists was started
-- by the single trigger the workflow had, and guessing is worse than saying nothing.
ALTER TABLE "workflow_run" ADD COLUMN "startedByTrigger" "WorkflowTrigger";

DROP INDEX "workflow_trigger_status_idx";
ALTER TABLE "workflow" DROP COLUMN "trigger";
ALTER TABLE "workflow" DROP COLUMN "assessmentId";
ALTER TABLE "workflow" DROP COLUMN "bandKey";
ALTER TABLE "workflow" DROP COLUMN "triggerTagId";
