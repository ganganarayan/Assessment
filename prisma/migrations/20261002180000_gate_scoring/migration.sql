-- Qualification-gate scoring. A gate answer can now carry points for the respondents who
-- PASS, so the gate is a weighted first question rather than only a yes/no door.
--
-- Both columns are nullable, and nullable is the whole compatibility story: every existing
-- submission keeps NULL, the scorer reads absent as zero, and no historical result moves.
-- They are stored per submission rather than recomputed from the gate config at scoring
-- time because that config can be edited in between, and a score that changes under a
-- respondent after the fact is worse than one that is slightly stale.
ALTER TABLE "submission" ADD COLUMN "gateScore" INTEGER;
ALTER TABLE "submission" ADD COLUMN "gateMax" INTEGER;
