-- WhatsApp message templates: drafted here, submitted to Meta.

CREATE TYPE "WaTemplateStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED');
CREATE TYPE "WaTemplateCategory" AS ENUM ('MARKETING', 'UTILITY', 'AUTHENTICATION');

CREATE TABLE "wa_template" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "category" "WaTemplateCategory" NOT NULL DEFAULT 'UTILITY',
    "headerText" TEXT,
    "bodyText" TEXT NOT NULL,
    "footerText" TEXT,
    "sampleValues" JSONB NOT NULL DEFAULT '[]',
    "status" "WaTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "metaId" TEXT,
    "metaStatus" TEXT,
    "rejectedReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_template_pkey" PRIMARY KEY ("id")
);

-- Meta's own key: one template name per language. A second row for the same pair is an
-- edit of the first, never a second template, so the database says so too.
CREATE UNIQUE INDEX "wa_template_tenantId_name_language_key" ON "wa_template"("tenantId", "name", "language");
CREATE INDEX "wa_template_tenantId_status_idx" ON "wa_template"("tenantId", "status");

ALTER TABLE "wa_template"
    ADD CONSTRAINT "wa_template_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
