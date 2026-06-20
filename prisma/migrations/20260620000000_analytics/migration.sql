-- Analytics: opt-in page views + VSL-load timestamp. All additive.

-- First /api/r read = the destination (VSL) page pulled the result.
ALTER TABLE "submission" ADD COLUMN "resultFetchedAt" TIMESTAMP(3);

-- One row per public assessment (opt-in) page load.
CREATE TABLE "page_view" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_view_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "page_view_assessmentId_idx" ON "page_view"("assessmentId");
CREATE INDEX "page_view_visitorId_idx" ON "page_view"("visitorId");

ALTER TABLE "page_view"
  ADD CONSTRAINT "page_view_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
