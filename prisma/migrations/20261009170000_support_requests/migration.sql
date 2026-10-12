-- In-app tickets and onboarding requests.
--
-- One table for both, split by "kind": same lifecycle, same notify path, same badge,
-- same thread. Two tables would have been two of every bug.
--
-- The whole feature is additive. Nothing existing reads these tables, and both modes
-- default to IN_APP so the behaviour on day one is the one that was asked for.

-- The human reference, shown as AS-1042 / OB-1042.
--
-- 🔴 A SEQUENCE, not a count-and-add. Two tickets raised in the same second would both
-- read the same count and both claim the same number, and the number is the thing a
-- tenant quotes back when they write in. One sequence across both kinds, so a number
-- can never name two threads.
--
-- Starting at 1001 because AS-1 reads like a test row and gets treated as one.
CREATE SEQUENCE "support_request_number_seq" START 1001;

CREATE TYPE "SupportKind" AS ENUM ('SUPPORT', 'ONBOARDING');
CREATE TYPE "SupportStatus" AS ENUM ('OPEN', 'AWAITING_US', 'AWAITING_TENANT', 'RESOLVED', 'CLOSED', 'FORWARDED');
CREATE TYPE "SupportAuthorRole" AS ENUM ('TENANT', 'PLATFORM');

CREATE TABLE "support_request" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL DEFAULT nextval('support_request_number_seq'),
    "kind" "SupportKind" NOT NULL,
    "status" "SupportStatus" NOT NULL DEFAULT 'OPEN',
    "topic" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    -- Snapshotted at raise time. A reply answers the person who asked, on the address
    -- the conversation started on, even if they have since changed it or been removed.
    "contactEmail" TEXT NOT NULL,
    "contactWhatsapp" TEXT,
    "lastSeenByTenantAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "forwardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_request_pkey" PRIMARY KEY ("id")
);

-- The sequence belongs to the column: dropping the table takes it with it, rather than
-- leaving an orphan sequence behind that the next migration has to know about.
ALTER SEQUENCE "support_request_number_seq" OWNED BY "support_request"."number";

CREATE UNIQUE INDEX "support_request_number_key" ON "support_request"("number");
-- The owner's queue reads "this kind, in these statuses, newest first".
CREATE INDEX "support_request_kind_status_createdAt_idx" ON "support_request"("kind", "status", "createdAt");
-- The tenant's own list.
CREATE INDEX "support_request_tenantId_kind_createdAt_idx" ON "support_request"("tenantId", "kind", "createdAt");

ALTER TABLE "support_request" ADD CONSTRAINT "support_request_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SetNull, not Cascade: a login can be removed while the thread it opened is still the
-- record of what was asked and what was answered.
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "support_message" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorRole" "SupportAuthorRole" NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    -- The owner's private note. Never sent, never rendered to the tenant.
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    -- What the notification actually did, so a failure can show a Resend button in the
    -- thread rather than being discovered a week later.
    "emailStatus" TEXT,
    "emailError" TEXT,
    -- The POST to the owner's CRM, which is what turns a reply into a WhatsApp at
    -- their end. This app never sends WhatsApp itself.
    "webhookStatus" TEXT,
    "webhookError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_message_requestId_createdAt_idx" ON "support_message"("requestId", "createdAt");

ALTER TABLE "support_message" ADD CONSTRAINT "support_message_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "support_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_message" ADD CONSTRAINT "support_message_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "support_attachment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "messageId" TEXT,
    -- The R2 object key, under the tenant's own prefix. Served only through an authed
    -- route; never handed out as a bucket URL.
    "key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_attachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_attachment_requestId_idx" ON "support_attachment"("requestId");

ALTER TABLE "support_attachment" ADD CONSTRAINT "support_attachment_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "support_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_attachment" ADD CONSTRAINT "support_attachment_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "support_message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Where a reply is sent. On the USER rather than the tenant: the person who raised the
-- ticket is the person who wants telling it was answered, and a workspace with two
-- logins has two people with two phones.
ALTER TABLE "user" ADD COLUMN "whatsapp" TEXT;

-- How each queue is handled. IN_APP is the shipping default for both, which is the
-- behaviour that was specified; the other two modes exist so one queue can be handed to
-- a support team later without going blind to the other.
ALTER TABLE "app_setting" ADD COLUMN "supportMode" TEXT NOT NULL DEFAULT 'IN_APP';
ALTER TABLE "app_setting" ADD COLUMN "onboardingMode" TEXT NOT NULL DEFAULT 'IN_APP';
ALTER TABLE "app_setting" ADD COLUMN "supportInboxEmail" TEXT;
-- Where a reply is announced, as one POST. Blank = nothing is posted and the reply
-- email still goes.
--
-- WhatsApp is not sent from this app at all: the CRM on the other end of this URL
-- already holds the approved templates, the opt-in state and the sending number.
ALTER TABLE "app_setting" ADD COLUMN "supportWebhookUrl" TEXT;
