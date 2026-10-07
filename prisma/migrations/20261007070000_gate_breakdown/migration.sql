-- The gate, question by question, resolved when it was answered.
--
-- The gate lives as JSON on the assessment and the owner can edit it at any time, so a
-- result page that rebuilt itself from the live config would reword its own questions
-- and lose deleted ones. Same reasoning as gateScore being written at start.
ALTER TABLE "submission" ADD COLUMN "gateBreakdown" JSONB;
