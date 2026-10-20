/**
 * Start any broadcast whose time has come, and send the next slice of whatever is
 * already going out. Once, then exit.
 *
 * 🔴 The schedule this runs on IS the send rate. One pass sends at most
 * ratePerMinute messages per broadcast, so calling it every minute means the number on
 * the broadcast is the number that actually goes out per minute. Call it less often
 * and everything simply takes longer, which is the safe direction: the cap exists
 * because a burst of blocks costs a WhatsApp number its messaging tier, and no amount
 * of hurry is worth that.
 *
 *   npm run cron:broadcasts
 *
 * Run with --conditions=react-server like the other cron scripts, because the engine
 * imports "server-only" which does not resolve under plain tsx.
 */
import { runDueBroadcasts } from "../src/lib/broadcasts/run";

async function main() {
  const s = await runDueBroadcasts();
  console.log(
    `[cron:broadcasts] started ${s.started}, sent ${s.sent}, failed ${s.failed}, skipped ${s.skipped}, finished ${s.finished}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[cron:broadcasts] failed:", e);
    process.exit(1);
  });
