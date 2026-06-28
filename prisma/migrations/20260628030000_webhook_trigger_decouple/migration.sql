-- Decouple webhook trigger from delivered name. eventType = which app event fires
-- it (delivery matches on this, not name). firstDeliveredAt locks name/url editing
-- once a delivery has succeeded. Back-fill eventType from current names, and
-- firstDeliveredAt from existing successful delivery logs (so working webhooks lock).

ALTER TABLE "webhook" ADD COLUMN "eventType" "EventType";
ALTER TABLE "webhook" ADD COLUMN "firstDeliveredAt" TIMESTAMP(3);

UPDATE "webhook" SET "eventType" = 'LEAD_CREATED'                WHERE "name" IN ('lead.created', 'optin');
UPDATE "webhook" SET "eventType" = 'ASSESSMENT_STARTED'         WHERE "name" = 'assessment.started';
UPDATE "webhook" SET "eventType" = 'ASSESSMENT_COMPLETED'       WHERE "name" = 'assessment.completed';
UPDATE "webhook" SET "eventType" = 'ASSESSMENT_COMPLETED_PAID'  WHERE "name" IN ('completed_paid', 'completed.paid');
UPDATE "webhook" SET "eventType" = 'ASSESSMENT_COMPLETED_UNPAID' WHERE "name" IN ('completed_unpaid', 'completed.unpaid');
UPDATE "webhook" SET "eventType" = 'RESULT_VIEWED'             WHERE "name" = 'result.viewed';
UPDATE "webhook" SET "eventType" = 'RESULT_GENERATED'         WHERE "name" = 'result.generated';
UPDATE "webhook" SET "eventType" = 'ASSESSMENT_ABANDONED'    WHERE "name" = 'assessment.abandoned';
UPDATE "webhook" SET "eventType" = 'RESULT_LINK_REQUESTED'  WHERE "name" = 'result.link_requested';
-- Any unrecognized legacy name: default to LEAD_CREATED so NOT NULL holds; the
-- admin can recreate it correctly (and it stays editable since not yet delivered).
UPDATE "webhook" SET "eventType" = 'LEAD_CREATED' WHERE "eventType" IS NULL;

ALTER TABLE "webhook" ALTER COLUMN "eventType" SET NOT NULL;

-- Lock webhooks that already have a successful delivery (working integrations).
UPDATE "webhook" w
SET "firstDeliveredAt" = sub.first_ok
FROM (
  SELECT "webhookId", MIN("createdAt") AS first_ok
  FROM "webhook_log"
  WHERE "success" = true AND "webhookId" IS NOT NULL
  GROUP BY "webhookId"
) sub
WHERE w.id = sub."webhookId";

CREATE INDEX "webhook_eventType_status_idx" ON "webhook"("eventType", "status");
