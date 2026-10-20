-- ZOOM_MEETING joins the step vocabulary: a step that MAKES something rather than one
-- that sends something.
--
-- ALONE IN ITS OWN MIGRATION, following the precedent in this repo: Postgres forbids
-- USING a new enum value in the transaction that adds it, and Prisma runs each migration
-- file as one transaction. Nothing here reads the label; the columns that do arrive in
-- the next file.
ALTER TYPE "AutomationChannel" ADD VALUE 'ZOOM_MEETING';
