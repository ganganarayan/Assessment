/**
 * Send every lifecycle plan that has come due, once, and exit.
 *
 * 🔴 SCHEDULE THIS EVERY 5 MINUTES. It is the half of the engine that makes the
 * per-person 24 hour clock real: the planner writes one row per person due at THEIR
 * own anchor minute, and this is what notices that the minute has arrived. A job
 * running hourly turns a 21:40 message into a 22:00 one for everybody, which is the
 * blast the whole design exists to avoid.
 *
 *   npm run cron:lifecycle-send
 *
 * Two switches stand in front of it: the "lifecycle" release key, and the
 * lifecycleLive setting on the platform singleton. Both off by default, so scheduling
 * this changes nothing until somebody decides otherwise.
 */
import { sendDueLifecycle } from "../src/lib/lifecycle/send";

async function main() {
  const s = await sendDueLifecycle();
  if (s.heldBack) {
    console.log("[cron:lifecycle-send] held back by the release switch, nothing sent");
    return;
  }
  if (s.dryRun) {
    console.log("[cron:lifecycle-send] dry run (lifecycleLive is off), nothing sent");
    return;
  }
  console.log(
    `[cron:lifecycle-send] claimed ${s.claimed}, sent ${s.sent}, skipped ${s.skipped}, ` +
      `failed ${s.failed}, whatsapp ${s.waSent} sent / ${s.waFailed} failed`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[cron:lifecycle-send] failed:", e);
    process.exit(1);
  });

export {};
