-- StartTrial, reported once per workspace.
--
-- Per workspace rather than per user: a second staff member signing in is not a second
-- trial. A stamp rather than firing on login, because a returning owner opens the app
-- every day and none of those days is a trial starting.
ALTER TABLE "tenant" ADD COLUMN "startTrialFiredAt" TIMESTAMP(3);
