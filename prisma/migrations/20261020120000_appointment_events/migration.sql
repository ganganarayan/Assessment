-- The five appointment events join the event vocabulary, so a booking, a cancellation
-- and above all an attendance or a no-show reach the owner's CRM and their ad account.
--
-- ALONE IN ITS OWN MIGRATION, following the subscription.cancelled precedent: Postgres
-- forbids USING a new enum value in the transaction that adds it, and Prisma runs each
-- migration file as one transaction. Nothing here reads these labels; the tables that
-- do arrive in the next file.
ALTER TYPE "EventType" ADD VALUE 'APPOINTMENT_BOOKED';
ALTER TYPE "EventType" ADD VALUE 'APPOINTMENT_RESCHEDULED';
ALTER TYPE "EventType" ADD VALUE 'APPOINTMENT_CANCELLED';
ALTER TYPE "EventType" ADD VALUE 'APPOINTMENT_ATTENDED';
ALTER TYPE "EventType" ADD VALUE 'APPOINTMENT_NO_SHOW';
