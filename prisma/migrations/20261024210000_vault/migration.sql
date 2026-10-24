-- Vault: buckets, folders and files on Cloudflare R2, driven by a person rather than
-- by the app. See the VAULT block in prisma/schema.prisma for why this is a second
-- storage layer and why vault_file.objectKey is never rewritten.

CREATE TYPE "VaultStorageClass" AS ENUM ('STANDARD', 'INFREQUENT_ACCESS');

CREATE TABLE "vault_bucket" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "bucketName" TEXT NOT NULL,
    "publicBaseUrl" TEXT,
    "storageClass" "VaultStorageClass" NOT NULL DEFAULT 'STANDARD',
    "accountId" TEXT NOT NULL,
    "accessKeyId" TEXT NOT NULL,
    "secretAccessKeyEnc" TEXT NOT NULL,
    "tenantId" TEXT,
    "quotaBytes" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_bucket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vault_folder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "parentId" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_folder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vault_file" (
    "id" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "folderId" TEXT,
    "tenantId" TEXT,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_file_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vault_bucket_tenantId_bucketName_key" ON "vault_bucket"("tenantId", "bucketName");
CREATE INDEX "vault_bucket_tenantId_idx" ON "vault_bucket"("tenantId");

CREATE INDEX "vault_folder_bucketId_parentId_idx" ON "vault_folder"("bucketId", "parentId");
CREATE INDEX "vault_folder_tenantId_idx" ON "vault_folder"("tenantId");

CREATE UNIQUE INDEX "vault_file_bucketId_objectKey_key" ON "vault_file"("bucketId", "objectKey");
CREATE INDEX "vault_file_bucketId_folderId_idx" ON "vault_file"("bucketId", "folderId");
CREATE INDEX "vault_file_tenantId_idx" ON "vault_file"("tenantId");

ALTER TABLE "vault_bucket" ADD CONSTRAINT "vault_bucket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vault_folder" ADD CONSTRAINT "vault_folder_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "vault_bucket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vault_folder" ADD CONSTRAINT "vault_folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "vault_folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vault_folder" ADD CONSTRAINT "vault_folder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vault_file" ADD CONSTRAINT "vault_file_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "vault_bucket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vault_file" ADD CONSTRAINT "vault_file_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "vault_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vault_file" ADD CONSTRAINT "vault_file_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
