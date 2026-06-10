/**
 * Seed the existing CRM webhook into the assessment.completed endpoint, and
 * ensure the AppSetting singleton exists. Idempotent — safe to run on any
 * environment (staging/production):
 *   npx tsx scripts/seed-webhooks.ts
 *
 * Reads CRM_WEBHOOK_URL from the environment.
 */
import { EventType } from "@prisma/client";
import { prisma } from "../src/lib/db/prisma";
import { generateWebhookSecret } from "../src/lib/webhooks/sign";

async function main() {
  await prisma.appSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  const url = process.env.CRM_WEBHOOK_URL;
  if (!url) {
    console.log("[seed-webhooks] CRM_WEBHOOK_URL not set; skipped CRM endpoint.");
    return;
  }

  const existing = await prisma.webhookEndpoint.findUnique({
    where: { event: EventType.ASSESSMENT_COMPLETED },
  });
  if (existing) {
    console.log("[seed-webhooks] assessment.completed endpoint already exists; left as-is.");
    return;
  }

  await prisma.webhookEndpoint.create({
    data: {
      event: EventType.ASSESSMENT_COMPLETED,
      url,
      enabled: true,
      secret: generateWebhookSecret(),
    },
  });
  console.log("[seed-webhooks] created assessment.completed endpoint from CRM_WEBHOOK_URL.");
}

main()
  .catch((e) => {
    console.error("[seed-webhooks] failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
