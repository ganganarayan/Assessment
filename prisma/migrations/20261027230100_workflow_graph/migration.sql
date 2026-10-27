-- The workflow graph: positions, edges, and who a sequence is about.

CREATE TYPE "WorkflowAudience" AS ENUM ('LEAD', 'TENANT');
CREATE TYPE "WorkflowEdgeLabel" AS ENUM ('NEXT', 'YES', 'NO');

-- Every workflow written before this column was about a lead, so that is the default
-- and the backfill at once.
ALTER TABLE "workflow" ADD COLUMN "audience" "WorkflowAudience" NOT NULL DEFAULT 'LEAD';

-- Null position = drawn before the canvas existed. The builder lays those out top to
-- bottom by displayOrder rather than piling them at the origin.
ALTER TABLE "workflow_step" ADD COLUMN "canvasX" INTEGER;
ALTER TABLE "workflow_step" ADD COLUMN "canvasY" INTEGER;

-- ---------------------------------------------------------------------------
-- WorkflowRun: the subject may now be a workspace, and a person may come back
-- ---------------------------------------------------------------------------

ALTER TABLE "workflow_run" ALTER COLUMN "contactId" DROP NOT NULL;
ALTER TABLE "workflow_run" ADD COLUMN "subjectTenantId" TEXT;

ALTER TABLE "workflow_run"
    ADD CONSTRAINT "workflow_run_subjectTenantId_fkey"
    FOREIGN KEY ("subjectTenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 🔴 DROPPED, NOT RELAXED. (workflow, contact) meant a person could pass through a
-- sequence exactly once for as long as the row survived. A lead who came back the next
-- quarter and booked again silently got no follow-up, and the only evidence was an
-- enrolment that never happened. The guard moves into the enroller, which refuses a
-- second run only while one is still active.
ALTER TABLE "workflow_run" DROP CONSTRAINT IF EXISTS "workflow_run_workflowId_contactId_key";
DROP INDEX IF EXISTS "workflow_run_workflowId_contactId_key";

CREATE INDEX "workflow_run_workflowId_contactId_idx" ON "workflow_run"("workflowId", "contactId");
CREATE INDEX "workflow_run_workflowId_subjectTenantId_idx" ON "workflow_run"("workflowId", "subjectTenantId");

-- Exactly one subject. Said here rather than trusted to every writer, because a run with
-- neither would sit in the queue forever with nobody to send to, and a run with both
-- would send the same sequence twice to two different people.
ALTER TABLE "workflow_run"
    ADD CONSTRAINT "workflow_run_one_subject"
    CHECK (("contactId" IS NOT NULL) <> ("subjectTenantId" IS NOT NULL));

-- ---------------------------------------------------------------------------
-- The edges
-- ---------------------------------------------------------------------------

CREATE TABLE "workflow_edge" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "fromStepId" TEXT,
    "toStepId" TEXT NOT NULL,
    "label" "WorkflowEdgeLabel" NOT NULL DEFAULT 'NEXT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_edge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_edge_workflowId_fromStepId_label_key" ON "workflow_edge"("workflowId", "fromStepId", "label");
CREATE INDEX "workflow_edge_workflowId_idx" ON "workflow_edge"("workflowId");
CREATE INDEX "workflow_edge_toStepId_idx" ON "workflow_edge"("toStepId");

-- 🔴 THE UNIQUE INDEX ABOVE DOES NOT COVER THE TRIGGER'S OWN EDGE. Postgres treats two
-- NULLs as distinct in a unique index, so a workflow could acquire two different first
-- steps and the runner would have no rule for choosing. This partial index is what
-- actually stops that. Prisma cannot express it, which is why it is written by hand.
CREATE UNIQUE INDEX "workflow_edge_trigger_once" ON "workflow_edge"("workflowId", "label") WHERE "fromStepId" IS NULL;

ALTER TABLE "workflow_edge"
    ADD CONSTRAINT "workflow_edge_workflowId_fkey"
    FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_edge"
    ADD CONSTRAINT "workflow_edge_fromStepId_fkey"
    FOREIGN KEY ("fromStepId") REFERENCES "workflow_step"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_edge"
    ADD CONSTRAINT "workflow_edge_toStepId_fkey"
    FOREIGN KEY ("toStepId") REFERENCES "workflow_step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Describe every sequence that already exists as a graph, so the canvas opens on the
-- real thing rather than on an empty board beside a workflow that plainly has steps.
--
-- LAG over displayOrder gives each step its predecessor, and NULL for the first one,
-- which is exactly what "the edge leaving the trigger" is. The id is derived from the
-- step rather than randomly generated so the statement needs no extension and is
-- repeatable: one incoming NEXT edge per step, so the pair is already unique.
WITH ordered AS (
    SELECT
        s."id" AS step_id,
        s."workflowId" AS workflow_id,
        LAG(s."id") OVER (PARTITION BY s."workflowId" ORDER BY s."displayOrder", s."id") AS prev_id
    FROM "workflow_step" s
)
INSERT INTO "workflow_edge" ("id", "workflowId", "fromStepId", "toStepId", "label")
SELECT
    'edge_' || md5(o.workflow_id || '|' || o.step_id),
    o.workflow_id,
    o.prev_id,
    o.step_id,
    'NEXT'
FROM ordered o;
