-- Template Library.
--
-- A new workspace lands in an empty builder, loses patience and never ships a funnel.
-- Templates give them a working assessment to import and edit on day one.
--
-- A template is a row HERE, not an Assessment with a flag. The flag version leaks into
-- the assessments list, Stats, Submissions, the dashboard counts and the sitemap, and
-- stays publicly reachable at /a/<slug> where it can collect real submissions from real
-- people. A separate table cannot do any of that.
--
-- `body` is the SAME portable shape export/import already uses, so every gate, result
-- page, band and setting a transfer carries, a template carries too.

CREATE TYPE "TemplateShape" AS ENUM ('GATE_ONLY', 'GATED_ASSESSMENT', 'UNGATED_ASSESSMENT');
CREATE TYPE "TemplateReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "template" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT,
    "shape" "TemplateShape" NOT NULL DEFAULT 'GATED_ASSESSMENT',
    "body" JSONB NOT NULL,
    "aiInstructions" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    -- Non-null = private to that one workspace, and nobody else ever lists it.
    "ownerTenantId" TEXT,
    -- Who contributed it. Kept (SetNull) after the tenant is gone: the library row
    -- stays, so the credit for it should too.
    "contributorTenantId" TEXT,
    "contributorName" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewStatus" "TemplateReviewStatus" NOT NULL DEFAULT 'APPROVED',
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "template_slug_key" ON "template"("slug");
CREATE INDEX "template_published_category_displayOrder_idx" ON "template"("published", "category", "displayOrder");
CREATE INDEX "template_ownerTenantId_idx" ON "template"("ownerTenantId");
CREATE INDEX "template_reviewStatus_idx" ON "template"("reviewStatus");

ALTER TABLE "template" ADD CONSTRAINT "template_ownerTenantId_fkey"
  FOREIGN KEY ("ownerTenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "template" ADD CONSTRAINT "template_contributorTenantId_fkey"
  FOREIGN KEY ("contributorTenantId") REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
