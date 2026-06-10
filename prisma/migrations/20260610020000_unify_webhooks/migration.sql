-- Unify Event Registry + Webhooks into a single Webhook model.

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "webhook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'ACTIVE',
    "secret" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_name_key" ON "webhook"("name");
CREATE INDEX "webhook_status_idx" ON "webhook"("status");

-- Migrate existing webhook_endpoint config into webhook (preserving id + secret).
INSERT INTO "webhook" ("id", "name", "url", "status", "secret", "createdAt", "updatedAt")
SELECT
  "id",
  CASE "event"
    WHEN 'LEAD_CREATED' THEN 'lead.created'
    WHEN 'ASSESSMENT_STARTED' THEN 'assessment.started'
    WHEN 'ASSESSMENT_COMPLETED' THEN 'assessment.completed'
    WHEN 'RESULT_GENERATED' THEN 'result.generated'
    WHEN 'RESULT_VIEWED' THEN 'result.viewed'
    WHEN 'ASSESSMENT_ABANDONED' THEN 'assessment.abandoned'
  END,
  "url",
  CASE WHEN "enabled" THEN 'ACTIVE'::"WebhookStatus" ELSE 'INACTIVE'::"WebhookStatus" END,
  "secret",
  "createdAt",
  "updatedAt"
FROM "webhook_endpoint";

-- Re-point WebhookLog: drop FK to webhook_endpoint, rename column (ids preserved).
ALTER TABLE "webhook_log" DROP CONSTRAINT IF EXISTS "webhook_log_webhookEndpointId_fkey";
ALTER TABLE "webhook_log" RENAME COLUMN "webhookEndpointId" TO "webhookId";

-- Drop the superseded tables. Log history (event_log, webhook_log) is untouched.
DROP TABLE "webhook_endpoint";
DROP TABLE "event";
DROP TYPE "EventStatus";
