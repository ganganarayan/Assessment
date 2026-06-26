-- Freeze a CRM resend batch: contacts pending when "Start" is clicked get
-- crmQueuedAt set; the drip sends only queued rows, so exactly that set is sent
-- (never contacts dirtied later). Cleared on successful send.
ALTER TABLE "submission" ADD COLUMN "crmQueuedAt" TIMESTAMP(3);
