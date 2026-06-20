-- Analytics baseline: when set, Stats + Contacts count only records at/after
-- this instant (a non-destructive "reset to 0"). Additive, nullable.
ALTER TABLE "app_setting" ADD COLUMN "statsResetAt" TIMESTAMP(3);
