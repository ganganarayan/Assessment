-- Durable webhook delivery queue. A pending row survives a deploy/restart so the
-- retry cron can re-attempt with backoff even if the inline first attempt was
-- killed mid-flight. url/secret/body are denormalized for byte-identical retries.

CREATE TABLE "webhook_delivery" (
  "id"            TEXT NOT NULL,
  "webhookId"     TEXT NOT NULL,
  "eventName"     TEXT NOT NULL,
  "endpoint"      TEXT NOT NULL,
  "secret"        TEXT NOT NULL,
  "body"          TEXT NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'pending',
  "attemptCount"  INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastStatus"    INTEGER,
  "lastError"     TEXT,
  "submissionId"  TEXT,
  "tenantId"      TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  "deliveredAt"   TIMESTAMP(3),
  CONSTRAINT "webhook_delivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhook_delivery_status_nextAttemptAt_idx" ON "webhook_delivery"("status", "nextAttemptAt");
CREATE INDEX "webhook_delivery_webhookId_idx" ON "webhook_delivery"("webhookId");
