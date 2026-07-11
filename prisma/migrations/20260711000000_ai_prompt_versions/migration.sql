-- Tenant-authored AI prompt instructions + per-assessment selection + word-count window.
ALTER TABLE "app_setting" ADD COLUMN "aiWordMin" INTEGER NOT NULL DEFAULT 200;
ALTER TABLE "app_setting" ADD COLUMN "aiWordMax" INTEGER NOT NULL DEFAULT 280;

ALTER TABLE "assessment" ADD COLUMN "aiPromptVersionId" TEXT;

CREATE TABLE "ai_prompt_version" (
  "id"           TEXT NOT NULL,
  "tenantId"     TEXT,
  "number"       INTEGER NOT NULL,
  "label"        TEXT NOT NULL,
  "instructions" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_prompt_version_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_prompt_version_tenantId_number_key" ON "ai_prompt_version"("tenantId", "number");
CREATE INDEX "ai_prompt_version_tenantId_idx" ON "ai_prompt_version"("tenantId");

ALTER TABLE "ai_prompt_version"
  ADD CONSTRAINT "ai_prompt_version_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
