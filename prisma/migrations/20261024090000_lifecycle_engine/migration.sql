-- LIFECYCLE ENGINE: the trial nurture planner.
--
-- Two tables and three enums. No data is backfilled: a profile is created the first
-- time the planner meets a trialling workspace, so installing this changes nothing
-- until the "lifecycle" release switch is turned on.

-- CreateEnum
CREATE TYPE "LifecycleStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'PARKED', 'UNSUBSCRIBED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LifecycleVerdict" AS ENUM ('SEND', 'SKIP', 'ESCALATE');

-- CreateEnum
CREATE TYPE "LifecyclePlanStatus" AS ENUM ('DRAFT', 'NEEDS_INPUT', 'APPROVED', 'SENT', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "lifecycle_profile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "anchorAt" TIMESTAMP(3) NOT NULL,
    "status" "LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "stopReason" TEXT,
    "lastPlannedOn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lifecycle_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifecycle_plan" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planDate" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "trialDay" INTEGER NOT NULL,
    "stageKey" TEXT NOT NULL,
    "verdict" "LifecycleVerdict" NOT NULL,
    "status" "LifecyclePlanStatus" NOT NULL DEFAULT 'DRAFT',
    "decidedBy" TEXT NOT NULL,
    "reason" TEXT,
    "facts" JSONB NOT NULL,
    "emailSubject" TEXT,
    "emailBody" TEXT,
    "waTemplate" TEXT,
    "waVars" JSONB,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lifecycle_plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lifecycle_profile_tenantId_key" ON "lifecycle_profile"("tenantId");

-- CreateIndex
CREATE INDEX "lifecycle_profile_status_anchorAt_idx" ON "lifecycle_profile"("status", "anchorAt");

-- CreateIndex
CREATE UNIQUE INDEX "lifecycle_plan_profileId_planDate_key" ON "lifecycle_plan"("profileId", "planDate");

-- CreateIndex
CREATE INDEX "lifecycle_plan_status_dueAt_idx" ON "lifecycle_plan"("status", "dueAt");

-- CreateIndex
CREATE INDEX "lifecycle_plan_tenantId_planDate_idx" ON "lifecycle_plan"("tenantId", "planDate");

-- AddForeignKey
ALTER TABLE "lifecycle_profile" ADD CONSTRAINT "lifecycle_profile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_plan" ADD CONSTRAINT "lifecycle_plan_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "lifecycle_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
