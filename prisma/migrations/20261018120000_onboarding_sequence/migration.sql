-- GUIDED SETUP: one row per question answered, per workspace.
--
-- Additive and empty on arrival: every existing workspace simply has no rows, which
-- the resolver reads as "nothing answered yet" and fills in from the facts it can
-- already check (a saved pixel, a sender, a colour), so nobody who configured their
-- workspace by hand is asked for it again.
--
-- No secret is ever written to "value": a token goes to its own encrypted column and
-- the row records only that the step was answered.
CREATE TABLE "onboarding_answer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "value" TEXT,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_answer_pkey" PRIMARY KEY ("id")
);

-- One answer per step per workspace: answering again updates the same row rather than
-- stacking a history nobody reads.
CREATE UNIQUE INDEX "onboarding_answer_tenantId_stepKey_key" ON "onboarding_answer"("tenantId", "stepKey");
CREATE INDEX "onboarding_answer_tenantId_idx" ON "onboarding_answer"("tenantId");

ALTER TABLE "onboarding_answer" ADD CONSTRAINT "onboarding_answer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
