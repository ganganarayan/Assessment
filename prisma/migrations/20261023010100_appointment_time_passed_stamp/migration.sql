-- The once-guard for APPOINTMENT_TIME_PASSED.
--
-- The sweep looks for a BOOKED appointment whose end time has gone by; without a stamp
-- it would find the same row on every pass and start the workflow again each minute.
ALTER TABLE "appointment" ADD COLUMN "firedTimePassedAt" TIMESTAMP(3);

-- The sweep's own index: status + endAt is exactly its WHERE clause, and it runs on a
-- timer forever, so it should never be a scan of every appointment the workspace has
-- ever taken.
CREATE INDEX "appointment_status_endAt_idx" ON "appointment"("status", "endAt");
