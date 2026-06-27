-- New completion event types. ALTER TYPE ... ADD VALUE must be isolated in its
-- own migration (cannot run in the same transaction as DDL that uses it).
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ASSESSMENT_COMPLETED_PAID';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ASSESSMENT_COMPLETED_UNPAID';
