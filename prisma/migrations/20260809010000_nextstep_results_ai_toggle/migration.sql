-- Results-on-platform nextStep option + per-assessment AI-statement toggle.
-- Enum ADD VALUE runs outside a txn on PG; Prisma applies it standalone.
ALTER TYPE "NextStep" ADD VALUE IF NOT EXISTS 'RESULTS';
ALTER TABLE "assessment" ADD COLUMN "useAiStatement" BOOLEAN NOT NULL DEFAULT true;
