-- The step kinds that do something other than send.
--
-- 🔴 ALONE IN ITS OWN MIGRATION. Postgres will not let an enum value be USED in the
-- transaction that added it, and Prisma runs each file as one. The columns that go with
-- these are in the migration after this one.

ALTER TYPE "WorkflowStepKind" ADD VALUE IF NOT EXISTS 'SUBFLOW';
ALTER TYPE "WorkflowStepKind" ADD VALUE IF NOT EXISTS 'ZOOM_MEETING';
ALTER TYPE "WorkflowStepKind" ADD VALUE IF NOT EXISTS 'WEBHOOK';
ALTER TYPE "WorkflowStepKind" ADD VALUE IF NOT EXISTS 'UNSUBSCRIBE';
ALTER TYPE "WorkflowStepKind" ADD VALUE IF NOT EXISTS 'NOTIFY_OWNER';
