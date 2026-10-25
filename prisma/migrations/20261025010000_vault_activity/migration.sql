-- Vault activity log: survives the file it describes, so "what did I upload, and what
-- did I delete" stays answerable. fileId is deliberately NOT a foreign key.

CREATE TYPE "VaultAction" AS ENUM ('UPLOADED', 'DELETED', 'RENAMED', 'MOVED');

CREATE TABLE "vault_activity" (
    "id" TEXT NOT NULL,
    "action" "VaultAction" NOT NULL,
    "fileId" TEXT,
    "name" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "contentType" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "durationMs" INTEGER,
    "detail" TEXT,
    "bucketId" TEXT NOT NULL,
    "tenantId" TEXT,
    "actorId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_activity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vault_activity_bucketId_at_idx" ON "vault_activity"("bucketId", "at");
CREATE INDEX "vault_activity_tenantId_at_idx" ON "vault_activity"("tenantId", "at");

ALTER TABLE "vault_activity" ADD CONSTRAINT "vault_activity_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "vault_bucket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vault_activity" ADD CONSTRAINT "vault_activity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
