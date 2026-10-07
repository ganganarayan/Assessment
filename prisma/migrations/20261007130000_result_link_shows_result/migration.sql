-- Let the emailed token link show the result even when the funnel ends somewhere else.
--
-- "Where the funnel sends people automatically" and "what a link I send later shows" were
-- the same setting, so a funnel ending at a signup page could never show a respondent the
-- result it had already scored and stored. Off by default: the token rides in the
-- respondent's destination URL, so this must be opted into.
ALTER TABLE "assessment" ADD COLUMN "resultLinkShowsResult" BOOLEAN NOT NULL DEFAULT false;
