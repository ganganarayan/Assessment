-- Pay-to-unlock: when paidMode is on, assessment submit redirects to paymentUrl
-- (with ?t=<token>) instead of the destination/VSL; the submit screen shows the
-- headline + button-label nudge.
ALTER TABLE "assessment"
  ADD COLUMN "paidMode"           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "paymentUrl"         TEXT,
  ADD COLUMN "paymentHeadline"    TEXT,
  ADD COLUMN "paymentButtonLabel" TEXT;
