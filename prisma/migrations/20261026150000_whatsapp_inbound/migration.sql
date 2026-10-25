-- Coexistence ingest: the contacts and conversations that arrive off the phone.
--
-- All additive. The new table starts empty, and every new column is nullable, so no
-- existing row needs a backfill and nothing reads differently until a coexistence
-- number is connected and a sync is asked for.

-- When a real WhatsApp message last passed between this person and the business.
-- Deliberately separate from lastSeenAt: filling in a form is not a conversation.
ALTER TABLE "contact" ADD COLUMN "lastMessageAt" TIMESTAMP(3);

-- How far the one-off history import has got, as Meta reports it chunk by chunk.
ALTER TABLE "app_setting" ADD COLUMN "wabaHistoryProgress" JSONB;

-- The messages themselves.
--
-- No tenant column: the owner is whoever owns the contact, and a second copy of that
-- fact is a second answer to the same question. The unique key is per CONTACT, which
-- is what makes ingest idempotent against redelivered webhooks and overlapping
-- history chunks.
CREATE TABLE "whatsapp_message" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "body" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "origin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_message_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_message_contactId_waMessageId_key" ON "whatsapp_message"("contactId", "waMessageId");
CREATE INDEX "whatsapp_message_contactId_sentAt_idx" ON "whatsapp_message"("contactId", "sentAt");

ALTER TABLE "whatsapp_message" ADD CONSTRAINT "whatsapp_message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
