-- Result pages become records of their own: a library you clone from, bound 1:1 to an
-- assessment.
--
-- Each kind keeps the storage it already had, so this is a re-parent, not a rewrite:
-- the VSL page's JSON moves into result_page_doc.draft/published, and the post-results
-- page's draft ROWS (assessment_page) are re-pointed from the assessment to the doc.
--
-- The assessment KEEPS publishedPages / resultPagePublished, and the public still
-- renders those columns. Publishing a doc mirrors its snapshot onto the bound
-- assessment, so nothing here can change what live traffic sees - the worst case of a
-- wrong backfill is a library row somebody has to re-edit before publishing it.

CREATE TYPE "ResultPageKind" AS ENUM ('RESULTS', 'VSL');

CREATE TABLE "result_page_doc" (
  "id"          TEXT NOT NULL,
  "kind"        "ResultPageKind" NOT NULL,
  "title"       TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "draft"       JSONB,
  "published"   JSONB,
  "publishedAt" TIMESTAMP(3),
  "sourceSlug"  TEXT,
  "tenantId"    TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "result_page_doc_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "result_page_doc_tenantId_slug_key" ON "result_page_doc"("tenantId", "slug");
CREATE INDEX "result_page_doc_tenantId_kind_idx" ON "result_page_doc"("tenantId", "kind");

-- A NULL tenantId is the PLATFORM's own library, and NULLs never collide in a
-- Postgres unique index - so the composite above does not constrain those rows at all.
-- This partial index is what actually keeps the platform's own slugs unique.
CREATE UNIQUE INDEX "result_page_doc_platform_slug_key" ON "result_page_doc"("slug") WHERE "tenantId" IS NULL;

ALTER TABLE "result_page_doc"
  ADD CONSTRAINT "result_page_doc_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The binding. UNIQUE on each column IS the 1:1 rule: the database refuses a second
-- assessment on the same page, whatever code tries it.
ALTER TABLE "assessment" ADD COLUMN "resultsDocId" TEXT;
ALTER TABLE "assessment" ADD COLUMN "vslDocId" TEXT;

CREATE UNIQUE INDEX "assessment_resultsDocId_key" ON "assessment"("resultsDocId");
CREATE UNIQUE INDEX "assessment_vslDocId_key" ON "assessment"("vslDocId");

ALTER TABLE "assessment"
  ADD CONSTRAINT "assessment_resultsDocId_fkey"
  FOREIGN KEY ("resultsDocId") REFERENCES "result_page_doc"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "assessment"
  ADD CONSTRAINT "assessment_vslDocId_fkey"
  FOREIGN KEY ("vslDocId") REFERENCES "result_page_doc"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "assessment_page" ADD COLUMN "docId" TEXT;

-- Backfill: one RESULTS doc per assessment that has draft pages or a published
-- snapshot. The id is derived from the assessment id so the updates below can find it
-- without a round trip, and the slug from the assessment slug, which is globally
-- unique and therefore unique within the workspace too.
INSERT INTO "result_page_doc" ("id", "kind", "title", "slug", "published", "publishedAt", "tenantId", "updatedAt")
SELECT
  'rpd_r_' || a."id",
  'RESULTS',
  a."title" || ' - results page',
  a."slug" || '-results',
  a."publishedPages",
  a."pagesPublishedAt",
  a."tenantId",
  CURRENT_TIMESTAMP
FROM "assessment" a
WHERE a."publishedPages" IS NOT NULL
   OR EXISTS (SELECT 1 FROM "assessment_page" ap WHERE ap."assessmentId" = a."id");

UPDATE "assessment" a
   SET "resultsDocId" = 'rpd_r_' || a."id"
 WHERE EXISTS (SELECT 1 FROM "result_page_doc" d WHERE d."id" = 'rpd_r_' || a."id");

UPDATE "assessment_page" ap SET "docId" = 'rpd_r_' || ap."assessmentId";

-- Backfill: one VSL doc per assessment that has either draft or published blocks. The
-- draft falls back to the published snapshot, so a page that was published and never
-- re-drafted opens with its own content instead of empty.
INSERT INTO "result_page_doc" ("id", "kind", "title", "slug", "draft", "published", "publishedAt", "tenantId", "updatedAt")
SELECT
  'rpd_v_' || a."id",
  'VSL',
  a."title" || ' - VSL page',
  a."slug" || '-vsl',
  COALESCE(a."resultPage", a."resultPagePublished"),
  a."resultPagePublished",
  a."resultPagePublishedAt",
  a."tenantId",
  CURRENT_TIMESTAMP
FROM "assessment" a
WHERE a."resultPage" IS NOT NULL
   OR a."resultPagePublished" IS NOT NULL;

UPDATE "assessment" a
   SET "vslDocId" = 'rpd_v_' || a."id"
 WHERE EXISTS (SELECT 1 FROM "result_page_doc" d WHERE d."id" = 'rpd_v_' || a."id");

-- Finalize the re-parent. Every row was covered by the insert above (its assessment
-- had pages by definition), so the delete is a guard against a row whose assessment
-- vanished mid-migration rather than an expected loss.
DELETE FROM "assessment_page" WHERE "docId" IS NULL;

ALTER TABLE "assessment_page" ALTER COLUMN "docId" SET NOT NULL;
ALTER TABLE "assessment_page" DROP CONSTRAINT "assessment_page_assessmentId_fkey";
DROP INDEX "assessment_page_assessmentId_order_idx";
ALTER TABLE "assessment_page" DROP COLUMN "assessmentId";

CREATE INDEX "assessment_page_docId_order_idx" ON "assessment_page"("docId", "order");
ALTER TABLE "assessment_page"
  ADD CONSTRAINT "assessment_page_docId_fkey"
  FOREIGN KEY ("docId") REFERENCES "result_page_doc"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
