-- How much of the result page's VSL a respondent has actually watched.
--
-- Per VidaPulse SESSION, deliberately. VidaPulse aggregates per session (a new one
-- starts at zero on every page load), so one stored number would FALL when somebody
-- reopens the emailed link and leaves after twenty seconds. The map keeps each session
-- apart; the two Float columns are derived from it on every write so the Submissions
-- table can sort without unpacking JSON.
--
-- All nullable, nothing backfilled: a submission with no reports simply has no figure,
-- which is the truth for every row that existed before this.
ALTER TABLE "submission"
  ADD COLUMN "vslWatchSessions" JSONB,
  ADD COLUMN "vslMaxPct"        DOUBLE PRECISION,
  ADD COLUMN "vslWatchSeconds"  DOUBLE PRECISION,
  ADD COLUMN "vslDuration"      DOUBLE PRECISION;
