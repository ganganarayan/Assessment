-- Broadcasts: one message to many people, once.
--
-- Separate from workflows because the direction is different. A workflow starts when
-- something happens to a person; a broadcast starts when the owner decides, and fans
-- out to whoever matched a filter at that moment.
--
-- The recipients are their own rows rather than a query re-run at send time, so the
-- count somebody approved before sending to five thousand people is the number that
-- actually goes out.

CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED', 'FAILED');
CREATE TYPE "BroadcastChannel" AS ENUM ('EMAIL', 'WABA');
CREATE TYPE "BroadcastRecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "broadcast" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "BroadcastChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "wabaTemplate" TEXT,
    "wabaLang" TEXT NOT NULL DEFAULT 'en',
    "wabaVars" JSONB,
    "audience" JSONB,
    -- DRAFT, so nothing can go out on the day it is written.
    "status" "BroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    -- Not a performance knob: a WhatsApp number is tiered per 24 hours and a burst of
    -- blocks drops the tier. 60 a minute is deliberately unambitious.
    "ratePerMinute" INTEGER NOT NULL DEFAULT 60,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "broadcast_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "broadcast_tenantId_createdAt_idx" ON "broadcast"("tenantId", "createdAt");
-- The worker asks "what is due to start", so it is one index.
CREATE INDEX "broadcast_status_scheduledAt_idx" ON "broadcast"("status", "scheduledAt");

CREATE TABLE "broadcast_recipient" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "BroadcastRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "toAddress" TEXT,
    "error" TEXT,
    "skipReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "broadcast_recipient_pkey" PRIMARY KEY ("id")
);

-- One row per person per broadcast, so re-running the materialiser after a failure
-- cannot queue anybody twice.
CREATE UNIQUE INDEX "broadcast_recipient_broadcastId_contactId_key" ON "broadcast_recipient"("broadcastId", "contactId");
-- The drain asks for the next N pending of one broadcast.
CREATE INDEX "broadcast_recipient_broadcastId_status_idx" ON "broadcast_recipient"("broadcastId", "status");
CREATE INDEX "broadcast_recipient_tenantId_createdAt_idx" ON "broadcast_recipient"("tenantId", "createdAt");

ALTER TABLE "broadcast" ADD CONSTRAINT "broadcast_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "broadcast_recipient" ADD CONSTRAINT "broadcast_recipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "broadcast_recipient" ADD CONSTRAINT "broadcast_recipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
