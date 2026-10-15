-- subscription.cancelled joins the event vocabulary, so the owner's CRM can hear that a
-- customer asked to stop and run a win-back.
--
-- 🔴 ITS OWN MIGRATION ON PURPOSE. Postgres forbids USING a new enum value in the same
-- transaction that adds it, and Prisma runs each migration file in one transaction. This
-- file only adds the label, and nothing here reads it, so it is safe - but keeping it
-- alone means a later migration that does reference the value cannot accidentally be
-- written into the same transaction.
ALTER TYPE "EventType" ADD VALUE 'SUBSCRIPTION_CANCELLED';
