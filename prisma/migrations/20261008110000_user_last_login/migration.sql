-- When each login last actually signed in.
--
-- The platform console could show when a workspace was created and nothing about
-- whether anyone ever came back, which is the single most useful fact about a trial:
-- a tenant who signed up and never returned is a different problem from one who logs
-- in daily and has not published.
--
-- A column rather than "newest session row", because sessions expire and get cleaned
-- up. Reading the session table would quietly turn an inactive tenant into one that
-- has never logged in at all, which is the opposite of what the column is for.
ALTER TABLE "user" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- Backfill from the newest session each user still has, so the column is useful on the
-- day it ships rather than in a fortnight. Users whose sessions have already expired
-- and been pruned stay null, which reads as "not since we started recording" - the
-- honest answer, and the reason the console renders null as a dash rather than "never".
UPDATE "user" u
SET "lastLoginAt" = s."latest"
FROM (
  SELECT "userId", MAX("createdAt") AS "latest" FROM "session" GROUP BY "userId"
) s
WHERE s."userId" = u."id";
