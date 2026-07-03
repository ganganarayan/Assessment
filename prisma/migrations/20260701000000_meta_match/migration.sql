-- Meta CAPI match signals persisted per submission, exposed via /api/meta-match
-- so an external CAPI sender (n8n) can build strongly-matched Purchase events.
ALTER TABLE "submission"
  ADD COLUMN "clientIp"        TEXT,
  ADD COLUMN "userAgent"       TEXT,
  ADD COLUMN "fbp"             TEXT,
  ADD COLUMN "fbc"             TEXT,
  ADD COLUMN "fbclidTimestamp" INTEGER;

-- Scoped, tenant-aware bearer tokens for external data endpoints (shared auth
-- layer). Only the sha256 hash is stored; scope enforces least privilege;
-- tenantId (nullable) scopes lookups (null = platform-owned).
CREATE TABLE "api_token" (
  "id"          TEXT NOT NULL,
  "tokenHash"   TEXT NOT NULL,
  "prefix"      TEXT NOT NULL,
  "scope"       TEXT NOT NULL,
  "label"       TEXT,
  "lastUsedAt"  TIMESTAMP(3),
  "revokedAt"   TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenantId"    TEXT,
  CONSTRAINT "api_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_token_tokenHash_key" ON "api_token"("tokenHash");
CREATE INDEX "api_token_scope_idx" ON "api_token"("scope");
CREATE INDEX "api_token_tenantId_idx" ON "api_token"("tenantId");

ALTER TABLE "api_token"
  ADD CONSTRAINT "api_token_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
