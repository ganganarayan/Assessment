-- The Zoom link a sequence made for one person.
--
-- 🔴 On the RUN, not on the step. A step is shared by everybody who passes through the
-- sequence; the meeting belongs to one of them, so storing it on the step would hand the
-- second person the first person's call.

ALTER TABLE "workflow_run" ADD COLUMN "meetingLink" TEXT;
