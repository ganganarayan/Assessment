-- New event type for a result-page booking CTA click.
--
-- Deliberately alone in its own migration: Postgres will not let a value added by
-- ALTER TYPE ... ADD VALUE be USED in the same transaction that adds it, and Prisma
-- wraps each migration in one. Splitting it means the value is committed before any
-- later migration or application code can reference it.
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'CTA_CLICKED';
