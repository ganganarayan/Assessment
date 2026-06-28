-- Post-assessment page builder: ordered pages, each with ordered typed blocks.
CREATE TABLE "assessment_page" (
  "id"           TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "order"        INTEGER NOT NULL DEFAULT 0,
  "title"        TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assessment_page_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "assessment_page_assessmentId_order_idx" ON "assessment_page"("assessmentId", "order");
ALTER TABLE "assessment_page"
  ADD CONSTRAINT "assessment_page_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "page_block" (
  "id"        TEXT NOT NULL,
  "pageId"    TEXT NOT NULL,
  "order"     INTEGER NOT NULL DEFAULT 0,
  "type"      TEXT NOT NULL,
  "config"    JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "page_block_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "page_block_pageId_order_idx" ON "page_block"("pageId", "order");
ALTER TABLE "page_block"
  ADD CONSTRAINT "page_block_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "assessment_page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
