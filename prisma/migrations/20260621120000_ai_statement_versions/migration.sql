-- Versioned per-submission AI messages (AI-generated or admin-written). The
-- default one is mirrored into resultSnapshot.aiStatement (served on the VSL).
CREATE TABLE "ai_statement" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "instruction" TEXT,
    "promptVersion" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_statement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_statement_submissionId_idx" ON "ai_statement"("submissionId");

-- Enforce AT MOST ONE default version per submission (partial unique index).
-- Makes the lazy-backfill seed and concurrent setDefault races safe at the DB.
CREATE UNIQUE INDEX "ai_statement_one_default_per_submission"
  ON "ai_statement"("submissionId") WHERE "isDefault" = true;

ALTER TABLE "ai_statement"
  ADD CONSTRAINT "ai_statement_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
