-- What the new step kinds need to point at.

ALTER TABLE "workflow_step" ADD COLUMN "targetWorkflowId" TEXT;
ALTER TABLE "workflow_step" ADD COLUMN "zoomTopic" TEXT;
ALTER TABLE "workflow_step" ADD COLUMN "webhookId" TEXT;

CREATE INDEX "workflow_step_targetWorkflowId_idx" ON "workflow_step"("targetWorkflowId");
CREATE INDEX "workflow_step_webhookId_idx" ON "workflow_step"("webhookId");

-- 🔴 SET NULL, NOT CASCADE, on both. The row pointing at the deleted thing lives inside
-- somebody else's published sequence. Cascading would delete a step out of the middle of
-- a live workflow because an unrelated endpoint was tidied up; setting null leaves a step
-- that does nothing and says so, which the owner can see and fix.
ALTER TABLE "workflow_step"
    ADD CONSTRAINT "workflow_step_targetWorkflowId_fkey"
    FOREIGN KEY ("targetWorkflowId") REFERENCES "workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workflow_step"
    ADD CONSTRAINT "workflow_step_webhookId_fkey"
    FOREIGN KEY ("webhookId") REFERENCES "webhook"("id") ON DELETE SET NULL ON UPDATE CASCADE;
