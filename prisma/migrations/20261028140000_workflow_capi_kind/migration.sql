-- A step that fires a Meta conversion.
--
-- 🔴 ALONE IN ITS OWN MIGRATION. Postgres will not let an enum value be USED in the
-- transaction that added it, and Prisma runs each file as one. The column it needs is in
-- the migration after this.

ALTER TYPE "WorkflowStepKind" ADD VALUE IF NOT EXISTS 'CAPI_EVENT';
