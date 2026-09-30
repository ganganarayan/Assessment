-- Stored PDF report location for a submission.
--
-- The key is never sent to a client: reports are streamed through the authorising
-- route, never served from a bucket URL, so nothing outside the server learns where a
-- file sits. The file name is random rather than derived from the submission id, so one
-- key reveals nothing about another and the bucket cannot be walked.
--
-- Null = not rendered yet, or cleared because the result changed and the stored copy
-- went stale.

ALTER TABLE "submission" ADD COLUMN "reportKey" TEXT;
