-- VSL result page (RESULTS mode). A self-contained marketing page stored as JSON on
-- the assessment: resultPage = editable draft, resultPagePublished = live snapshot the
-- token result page renders. All nullable => every existing assessment keeps the
-- current score-card result until a page is built and published.
ALTER TABLE "assessment" ADD COLUMN "resultPage" JSONB;
ALTER TABLE "assessment" ADD COLUMN "resultPagePublished" JSONB;
ALTER TABLE "assessment" ADD COLUMN "resultPagePublishedAt" TIMESTAMP(3);
