-- Vault cleanup logs aborted incomplete multipart uploads.
--
-- An incomplete multipart upload is parts that R2 stores and bills while they belong to
-- no object, so they show in no file listing. Cleanup aborts the ones older than a day
-- and records it here, which is the only place that cost ever becomes visible.
--
-- ALTER TYPE ADD VALUE stands alone deliberately: the new value is not used by any
-- statement in this migration, which is what lets Postgres run it inside the
-- transaction Prisma wraps a migration in.
ALTER TYPE "VaultAction" ADD VALUE 'ABORTED';
