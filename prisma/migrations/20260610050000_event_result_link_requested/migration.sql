-- New event for "email my previous results" (returning user, retake lockout).
-- Isolated in its own migration: Postgres ALTER TYPE ... ADD VALUE cannot be
-- used in the same transaction that creates it.
ALTER TYPE "EventType" ADD VALUE 'RESULT_LINK_REQUESTED';
