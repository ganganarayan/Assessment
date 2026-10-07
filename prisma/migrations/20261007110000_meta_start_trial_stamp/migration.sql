-- Manual StartTrial, stamped per lead so a second click reports nothing.
ALTER TABLE "submission" ADD COLUMN "metaStartTrialAt" TIMESTAMP(3);
