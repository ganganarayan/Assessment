-- Rename the Role enum value TENANT_ADMIN -> ADMIN.
-- RENAME VALUE preserves all existing rows (the enum element is the same;
-- only its label changes), so no data is lost and it runs inside Prisma's
-- migration transaction.
ALTER TYPE "Role" RENAME VALUE 'TENANT_ADMIN' TO 'ADMIN';

-- Keep the column default in sync with the new label.
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'ADMIN';
