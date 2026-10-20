/**
 * cron:ai-costs - pull what the AI providers actually billed, for the settled day.
 *
 * Runs once a day. It pulls YESTERDAY, never today: a day is only final once it is
 * over, and both providers warn that usage takes minutes to land. A partial day looks
 * exactly like a cheap one.
 *
 * Re-running is safe and is the point. A day is upserted, and the newest answer
 * replaces the old one, so a day pulled while the provider was still settling is
 * corrected by the next run rather than left wrong forever.
 *
 *   npm run cron:ai-costs            the settled day
 *   npm run cron:ai-costs -- 7       the last 7 settled days (backfill)
 *
 * 🔴 NEEDS A RAILWAY CRON, like cron:webhooks. Without one nothing pulls, the Accounts
 * page has no billed figure, and it says so rather than showing an estimate.
 */
import { pullAiCostDay, lastSettledDay, utcDay } from "../src/lib/ai/cost-report";
import { prisma } from "../src/lib/db/prisma";

async function main() {
  const days = Math.max(1, Math.min(90, Number(process.argv[2] ?? "1") || 1));
  const last = new Date(`${lastSettledDay()}T00:00:00Z`);

  for (let i = 0; i < days; i++) {
    const day = utcDay(new Date(last.getTime() - i * 24 * 60 * 60 * 1000));
    const r = await pullAiCostDay(day);
    const parts = [
      r.written.length ? `wrote ${r.written.join(", ")}` : null,
      r.skipped.length ? `no admin key for ${r.skipped.join(", ")}` : null,
      r.failed.length ? `FAILED ${r.failed.join(", ")}` : null,
    ].filter(Boolean);
    console.log(`${day}: ${parts.join(" | ") || "nothing to do"}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
