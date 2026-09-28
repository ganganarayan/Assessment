/**
 * Railway Cron entrypoint: run the sweeps —
 *   - assessment.abandoned (started, never completed past the delay)
 *   - completed_unpaid (completed, no payment after 30 min)
 *   - gate abandoned (passed the page-1 gate, never completed → Meta
 *     AssessmentAbandoned for retargeting)
 *   - booking-CTA owner notifications that failed their first send
 * Schedule every ~10 min so the 30-min unpaid nudge fires close to on time:
 *   npx tsx scripts/sweep-abandoned.ts
 */
import { sweepAbandoned, sweepGateAbandoned } from "../src/lib/events/abandoned";
import { sweepCtaNotifications } from "../src/lib/cta/notify";
import { sweepCompletedUnpaid } from "../src/lib/events/unpaid";
import { prisma } from "../src/lib/db/prisma";

async function main() {
  const abandoned = await sweepAbandoned();
  console.log(`[abandoned-sweep] swept=${abandoned.swept} scanned=${abandoned.scanned}`);
  const unpaid = await sweepCompletedUnpaid();
  console.log(`[unpaid-sweep] swept=${unpaid.swept} scanned=${unpaid.scanned}`);
  // Meta AssessmentAbandoned: passed the page-1 gate, never completed.
  const gate = await sweepGateAbandoned();
  console.log(`[gate-abandoned-sweep] fired=${gate.fired} scanned=${gate.scanned}`);
  // Booking-CTA owner notifications whose send failed earlier: retried until they land
  // or the backoff schedule is exhausted, so a call request is never silently lost.
  const cta = await sweepCtaNotifications();
  console.log(`[cta-notify-sweep] processed=${cta.processed}`);
}

main()
  .catch((e) => {
    console.error("[abandoned-sweep] failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
