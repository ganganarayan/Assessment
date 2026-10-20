-- Contacts, tags, consent and do-not-disturb.
--
-- DDL ONLY. The backfill that turns existing submissions and gate entries into
-- contacts is a SCRIPT (npm run backfill:contacts), not SQL, and deliberately so: a
-- mobile becomes a contact's identity only after it goes through toE164Digits, which
-- strips a trunk zero and prepends the tenant's country code. Reimplementing that in
-- SQL would mean two normalisers that drift, and the day they disagree is the day one
-- person becomes two contacts and gets every message twice.
--
-- So this migration is safe to run on a live database at any time: it adds tables
-- nothing reads yet and two nullable columns nothing requires.

CREATE TABLE "contact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mobile" TEXT,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "profession" TEXT,
    "consentAt" TIMESTAMP(3),
    "consentText" TEXT,
    "marketingOptOutAt" TIMESTAMP(3),
    "optOutSource" TEXT,
    "optOutToken" TEXT NOT NULL,
    "source" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_optOutToken_key" ON "contact"("optOutToken");
-- NULLs are distinct in Postgres, so the email-only contacts a SPLIT gate produces do
-- not collide with one another, and neither do the mobile-only ones.
CREATE UNIQUE INDEX "contact_tenantId_mobile_key" ON "contact"("tenantId", "mobile");
CREATE UNIQUE INDEX "contact_tenantId_email_key" ON "contact"("tenantId", "email");
CREATE INDEX "contact_tenantId_createdAt_idx" ON "contact"("tenantId", "createdAt");
-- The broadcast audience query is "this tenant, not opted out", so it is one index.
CREATE INDEX "contact_tenantId_marketingOptOutAt_idx" ON "contact"("tenantId", "marketingOptOutAt");

CREATE TABLE "tag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tag_tenantId_name_key" ON "tag"("tenantId", "name");
CREATE INDEX "tag_tenantId_idx" ON "tag"("tenantId");

CREATE TABLE "contact_tag" (
    "contactId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contact_tag_pkey" PRIMARY KEY ("contactId","tagId")
);

CREATE INDEX "contact_tag_tagId_idx" ON "contact_tag"("tagId");

-- The link from a run to the person. Nullable, and SET NULL on delete: removing a
-- contact must never take a submission with it, because the submission is the record
-- of what somebody did and the contact is only who they are.
ALTER TABLE "submission" ADD COLUMN "contactId" TEXT;
ALTER TABLE "gate_entry" ADD COLUMN "contactId" TEXT;
CREATE INDEX "submission_contactId_idx" ON "submission"("contactId");
CREATE INDEX "gate_entry_contactId_idx" ON "gate_entry"("contactId");

-- The consent line shown under the opt-in form, per tenant. Blank falls back to code.
ALTER TABLE "app_setting" ADD COLUMN "consentText" TEXT;

ALTER TABLE "contact" ADD CONSTRAINT "contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tag" ADD CONSTRAINT "tag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_tag" ADD CONSTRAINT "contact_tag_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_tag" ADD CONSTRAINT "contact_tag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submission" ADD CONSTRAINT "submission_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gate_entry" ADD CONSTRAINT "gate_entry_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
