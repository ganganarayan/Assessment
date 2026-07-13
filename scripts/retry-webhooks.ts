/**
 * Railway Cron entrypoint: retry any due webhook deliveries (failed earlier, or
 * whose inline first attempt was killed by a deploy). Schedule every ~1–2 min so
 * the first retry (+2 min) fires close to on time:
 *   npx tsx scripts/retry-webhooks.ts
 */
import { retryPendingWebhooks } from "../src/lib/webhooks/retry";
import { prisma } from "../src/lib/db/prisma";

async function main() {
  const r = await retryPendingWebhooks();
  console.log(`[webhook-retry] processed=${r.processed}`);
}

main()
  .catch((e) => {
    console.error("[webhook-retry] failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
