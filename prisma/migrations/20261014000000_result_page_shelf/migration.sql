-- The platform shelf for result pages: a page the owner publishes once that every
-- workspace can import a copy of, exactly like the assessment Template library.
--
-- Additive and defaulted, so every existing page stays off the shelf. Listing is a
-- decision taken on the owner's screen, never a side effect of a deploy - the same rule
-- the template seeder follows, and for the same reason: content nobody has read must
-- not appear on a customer's first screen.
--
-- shelfListed is NOT `published`. `published` means "this page has a live snapshot on
-- its funnel"; shelfListed means "other workspaces may copy it". A shelf page is
-- normally unpublished and bound to nothing, because what a tenant imports is the
-- draft.
ALTER TABLE "result_page_doc" ADD COLUMN "shelfListed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "result_page_doc" ADD COLUMN "shelfCategory" TEXT;
ALTER TABLE "result_page_doc" ADD COLUMN "shelfSummary" TEXT;
ALTER TABLE "result_page_doc" ADD COLUMN "shelfOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "result_page_doc_shelfListed_kind_shelfOrder_idx"
  ON "result_page_doc"("shelfListed", "kind", "shelfOrder");
