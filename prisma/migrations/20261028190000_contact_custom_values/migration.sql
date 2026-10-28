-- CUSTOM VALUES A WORKSPACE KEEPS ABOUT A PERSON.
--
-- A registry of fields, declared once, plus one row per contact per field. The registry
-- is what lets the message builder LIST what this workspace can put in a message: a
-- placeholder nobody can see is a placeholder nobody uses, and a JSON blob on the
-- contact could only ever answer "what does this one person have", which is the wrong
-- question at the moment somebody is writing to five hundred of them.

CREATE TABLE "contact_field" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    -- The placeholder name: {{key}}. Refused at creation if it collides with a built-in
    -- name, rather than resolved away at send time.
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    -- 🔴 Hold the message when the value is empty, rather than sending it with a hole in
    -- it. True by default because the failure it prevents is the one that reaches a
    -- customer: "join here:" with nothing after.
    "holdWhenEmpty" BOOLEAN NOT NULL DEFAULT true,
    -- True for a key the app writes rather than a person (the Zoom meeting link).
    "system" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contact_field_pkey" PRIMARY KEY ("id")
);

-- One field per name per workspace: {{plan}} has to mean one thing.
CREATE UNIQUE INDEX "contact_field_tenantId_key_key" ON "contact_field"("tenantId", "key");
CREATE INDEX "contact_field_tenantId_idx" ON "contact_field"("tenantId");

ALTER TABLE "contact_field"
    ADD CONSTRAINT "contact_field_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "contact_field_value" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    -- Text, always: the placeholder filler substitutes strings, and a typed column would
    -- promise validation that nothing on the write paths performs.
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contact_field_value_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_field_value_contactId_fieldId_key"
    ON "contact_field_value"("contactId", "fieldId");
CREATE INDEX "contact_field_value_fieldId_idx" ON "contact_field_value"("fieldId");

ALTER TABLE "contact_field_value"
    ADD CONSTRAINT "contact_field_value_fieldId_fkey"
    FOREIGN KEY ("fieldId") REFERENCES "contact_field"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_field_value"
    ADD CONSTRAINT "contact_field_value_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 🔴 THE ZOOM LINK NOW LIVES IN ONE PLACE, and the run is not it.
--
-- It was added to the run yesterday so that {{meetingLink}} had somewhere to read from,
-- which made the link visible only inside the sequence that created it. A custom value
-- on the CONTACT is visible to every sequence, every message and the owner, and a second
-- meeting simply overwrites the first - which is what was asked for and what "their
-- meeting link" means to somebody reading it.
--
-- Nothing is migrated across. The column shipped yesterday, holds a link to a meeting
-- that has already happened or is about to, and a workspace with a stale link in a
-- message is worse off than one with an empty value that holds the message back.
ALTER TABLE "workflow_run" DROP COLUMN "meetingLink";
