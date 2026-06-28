/**
 * Seed the existing CRM webhook (assessment.completed) and ensure the AppSetting
 * singleton exists. Idempotent — safe on any environment:
 *   npx tsx scripts/seed-webhooks.ts
 * Reads CRM_WEBHOOK_URL from the environment.
 */
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
    console.log("[seed-webhooks] CRM_WEBHOOK_URL not set; skipped CRM webhook.");
    return;
  }

  const existing = await prisma.webhook.findUnique({
    where: { name: "assessment.completed" },
  });
  if (existing) {
    console.log("[seed-webhooks] assessment.completed webhook already exists; left as-is.");
    return;
  }

  await prisma.webhook.create({
    data: {
      eventType: "ASSESSMENT_COMPLETED",
      name: "assessment.completed",
      url,
      status: "ACTIVE",
      secret: generateWebhookSecret(),
    },
  });
  console.log("[seed-webhooks] created assessment.completed webhook from CRM_WEBHOOK_URL.");
}

main()
  .catch((e) => {
    console.error("[seed-webhooks] failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
