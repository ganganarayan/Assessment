-- Staff members: a User with staffPermission set is a limited staff account.
-- NULL = full-access owner/admin (unchanged).
CREATE TYPE "StaffPermission" AS ENUM ('VIEW', 'EDIT');
ALTER TABLE "user" ADD COLUMN "staffPermission" "StaffPermission";
