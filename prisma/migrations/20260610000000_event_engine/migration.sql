-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('LEAD_CREATED', 'ASSESSMENT_STARTED', 'ASSESSMENT_COMPLETED', 'RESULT_GENERATED', 'RESULT_VIEWED', 'ASSESSMENT_ABANDONED');

-- AlterTable
ALTER TABLE "submission" ADD COLUMN "abandonedAt" TIMESTAMP(3);
ALTER TABLE "submission" ADD COLUMN "resultViewedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "event_log" (
    "id" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'assess360',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submissionId" TEXT,
    "assessmentId" TEXT,
    "leadEmail" TEXT,

    CONSTRAINT "event_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoint" (
    "id" TEXT NOT NULL,
    "event" "EventType" NOT NULL,
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "secret" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_endpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_log" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "error" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "webhookEndpointId" TEXT,
    "submissionId" TEXT,

    CONSTRAINT "webhook_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_setting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "abandonedAfterHours" INTEGER NOT NULL DEFAULT 24,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "submission_status_startedAt_idx" ON "submission"("status", "startedAt");

-- CreateIndex
CREATE INDEX "event_log_type_idx" ON "event_log"("type");
CREATE INDEX "event_log_createdAt_idx" ON "event_log"("createdAt");
CREATE INDEX "event_log_submissionId_idx" ON "event_log"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_endpoint_event_key" ON "webhook_endpoint"("event");

-- CreateIndex
CREATE INDEX "webhook_log_eventName_idx" ON "webhook_log"("eventName");
CREATE INDEX "webhook_log_success_idx" ON "webhook_log"("success");
CREATE INDEX "webhook_log_createdAt_idx" ON "webhook_log"("createdAt");

-- AddForeignKey
ALTER TABLE "webhook_log" ADD CONSTRAINT "webhook_log_webhookEndpointId_fkey" FOREIGN KEY ("webhookEndpointId") REFERENCES "webhook_endpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
