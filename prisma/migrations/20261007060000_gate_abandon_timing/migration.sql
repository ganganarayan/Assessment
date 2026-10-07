-- Separate the two ways of losing someone who passed the gate, and delay the verdict.
--
-- optinSeenAt  : they reached the opt-in form. Set => AssessmentAbandoned (saw the ask,
--                refused it). Null => GateIncomplete (never got that far).
-- abandonDueAt : when the verdict becomes due, set ten minutes ahead when the visitor
--                leaves the opt-in page, so an app switch and a return is not a loss.
ALTER TABLE "gate_entry" ADD COLUMN "optinSeenAt" TIMESTAMP(3);
ALTER TABLE "gate_entry" ADD COLUMN "abandonDueAt" TIMESTAMP(3);

CREATE INDEX "gate_entry_abandonedFiredAt_abandonDueAt_idx"
  ON "gate_entry"("abandonedFiredAt", "abandonDueAt");
