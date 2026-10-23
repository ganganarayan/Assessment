-- The appointment moments join the workflow trigger vocabulary, so a sequence can
-- start from a booking the same way it starts from an opt-in. APPOINTMENT_TIME_PASSED
-- is the one nothing emits: a sweep finds a call whose hour went by unmarked.
--
-- ALONE IN ITS OWN MIGRATION, following the precedent in this repo: Postgres forbids
-- USING a new enum value in the transaction that adds it, and Prisma runs each
-- migration file as one transaction. Nothing here reads these labels; the column that
-- goes with them arrives in the next file.
ALTER TYPE "WorkflowTrigger" ADD VALUE 'APPOINTMENT_BOOKED';
ALTER TYPE "WorkflowTrigger" ADD VALUE 'APPOINTMENT_RESCHEDULED';
ALTER TYPE "WorkflowTrigger" ADD VALUE 'APPOINTMENT_CANCELLED';
ALTER TYPE "WorkflowTrigger" ADD VALUE 'APPOINTMENT_ATTENDED';
ALTER TYPE "WorkflowTrigger" ADD VALUE 'APPOINTMENT_NO_SHOW';
ALTER TYPE "WorkflowTrigger" ADD VALUE 'APPOINTMENT_TIME_PASSED';
