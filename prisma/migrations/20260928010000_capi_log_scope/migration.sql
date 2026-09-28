-- Which funnel a CAPI log row belongs to.
-- The assessment funnel and the Assess360 SaaS funnel both log rows with tenantId
-- NULL and the same standard event names, so an assessment opt-in and a SaaS signup
-- both read "CompleteRegistration" with nothing to tell them apart. Existing rows are
-- all assessment-funnel events, which is what the default backfills them to.
ALTER TABLE "capi_log" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'assessment';
CREATE INDEX "capi_log_scope_createdAt_idx" ON "capi_log"("scope", "createdAt");
