-- Published snapshot of the result-page builder. Draft = relational rows; public
-- renders only this snapshot, so unpublished edits never go live.
ALTER TABLE "assessment"
  ADD COLUMN "publishedPages"   JSONB,
  ADD COLUMN "pagesPublishedAt" TIMESTAMP(3);
