/**
 * Plan today's trial nurture, once, and exit.
 *
 * 🔴 SCHEDULE THIS AT 00:30 UTC, which is 06:00 IST. Railway cron is UTC and does not
 * know about IST; a schedule written as "0 6 * * *" runs at 11:30 in the morning here
 * and the whole point of the job is lost.
 *
 *   npm run cron:lifecycle
 *
 * It writes plans. It sends nothing: Phase 1 is dry run end to end, and the sender
 * arrives with Phase 2. Held back by the "lifecycle" release switch, so installing it
 * and scheduling it changes nothing until the switch is turned on.
 */
import { planToday } from "../src/lib/lifecycle/plan";

async function main() {
  const s = await planToday();
  if (s.heldBack) {
    console.log("[cron:lifecycle] held back by the release switch, nothing planned");
    return;
  }
  console.log(
    `[cron:lifecycle] considered ${s.considered}, planned ${s.planned}, skipped ${s.skipped}, ` +
      `escalated ${s.escalated} (routed ${s.routed}, model ${s.byModel}), closed ${s.closed}, failed ${s.failed}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[cron:lifecycle] failed:", e);
    process.exit(1);
  });

export {};
