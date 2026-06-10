/**
 * Railway Cron entrypoint: mark abandoned assessments and emit
 * assessment.abandoned. Schedule this in Railway (e.g. hourly) with:
 *   npx tsx scripts/sweep-abandoned.ts
 */
import { sweepAbandoned } from "../src/lib/events/abandoned";
import { prisma } from "../src/lib/db/prisma";

async function main() {
  const result = await sweepAbandoned();
  console.log(`[abandoned-sweep] swept=${result.swept} scanned=${result.scanned}`);
}

main()
  .catch((e) => {
    console.error("[abandoned-sweep] failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
