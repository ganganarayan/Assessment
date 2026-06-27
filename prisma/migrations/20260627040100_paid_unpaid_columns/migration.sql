-- Paid/unpaid completion guards (compare-and-swap, one event each) + autosaved
-- draft answers (resume until paid).
ALTER TABLE "submission"
  ADD COLUMN "completedPaidAt"   TIMESTAMP(3),
  ADD COLUMN "completedUnpaidAt" TIMESTAMP(3),
  ADD COLUMN "draftAnswers"      JSONB;
