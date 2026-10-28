-- Two more ways in: a contact appearing, and a contact's own details changing.
--
-- 🔴 ITS OWN MIGRATION, because Postgres refuses to USE an enum value in the same
-- transaction that added it. The binding table and its backfill land first, and
-- anything that stores one of these values comes after this file.
ALTER TYPE "WorkflowTrigger" ADD VALUE 'CONTACT_CREATED';
ALTER TYPE "WorkflowTrigger" ADD VALUE 'CONTACT_UPDATED';
