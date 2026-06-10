-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('ACTIVE', 'DEACTIVATED', 'PURGED');

-- CreateTable
CREATE TABLE "event" (
    "id" TEXT NOT NULL,
    "product" TEXT NOT NULL DEFAULT 'assess360',
    "name" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'ACTIVE',
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_product_name_key" ON "event"("product", "name");
CREATE INDEX "event_status_idx" ON "event"("status");

-- Seed the 6 built-in Assess360 events (idempotent).
INSERT INTO "event" ("id", "product", "name", "status", "builtIn", "createdAt", "updatedAt") VALUES
  ('evt_lead_created',         'assess360', 'lead.created',         'ACTIVE', true, NOW(), NOW()),
  ('evt_assessment_started',   'assess360', 'assessment.started',   'ACTIVE', true, NOW(), NOW()),
  ('evt_assessment_completed', 'assess360', 'assessment.completed', 'ACTIVE', true, NOW(), NOW()),
  ('evt_result_generated',     'assess360', 'result.generated',     'ACTIVE', true, NOW(), NOW()),
  ('evt_result_viewed',        'assess360', 'result.viewed',        'ACTIVE', true, NOW(), NOW()),
  ('evt_assessment_abandoned', 'assess360', 'assessment.abandoned', 'ACTIVE', true, NOW(), NOW())
ON CONFLICT ("product", "name") DO NOTHING;
