-- How many times each login has actually signed in.
--
-- "Last login" alone cannot separate the two trial failures that need different
-- answers: someone who signed up, looked once and never came back, and someone who
-- logs in every day and still has not published a funnel. One needs chasing, the other
-- needs help. The count beside the date tells them apart at a glance.
--
-- It lives in the Last login cell, not a column of its own - the tenant table is
-- already wide, and a bare number in its own column is a statistic rather than a fact
-- about a date.
ALTER TABLE "user" ADD COLUMN "loginCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill from the sessions each user still has. This UNDERCOUNTS, and knowingly:
-- expired sessions are pruned, so historical sign-ins are simply not recoverable. It
-- is a floor, not a total, which is why the console prints it next to a date that is
-- honest about the same limit rather than as a lifetime figure.
UPDATE "user" u
SET "loginCount" = s."n"
FROM (SELECT "userId", COUNT(*)::int AS "n" FROM "session" GROUP BY "userId") s
WHERE s."userId" = u."id";
