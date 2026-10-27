-- The node kinds the canvas does not draw yet.
--
-- 🔴 ALONE IN ITS OWN MIGRATION ON PURPOSE. Postgres will not let a value added to an
-- enum be USED in the same transaction that added it, and Prisma runs each migration
-- file as one transaction. Put these beside the table that references them and the whole
-- migration fails on a deploy, not here.

ALTER TYPE "WorkflowStepKind" ADD VALUE IF NOT EXISTS 'BRANCH';
ALTER TYPE "WorkflowStepKind" ADD VALUE IF NOT EXISTS 'LOOP';
ALTER TYPE "WorkflowStepKind" ADD VALUE IF NOT EXISTS 'EXIT';
