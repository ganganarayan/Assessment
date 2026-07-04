-- Unguessable per-submission edit token: handed to the client at Start and required
-- to save drafts / complete, so those write actions can't be driven by guessing the
-- submission id. Nullable — rows created before this stay null (legacy, allowed).
ALTER TABLE "submission" ADD COLUMN "editToken" TEXT;
