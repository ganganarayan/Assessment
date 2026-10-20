/**
 * Advance every workflow run that is due, once, and exit.
 *
 * 🔴 NOT OPTIONAL, unlike its automation counterpart. The automations carry their own
 * in-process scheduler; workflows deliberately do not, because a sequence step can be
 * due a month out and an in-process timer is a promise the next deploy quietly breaks.
 * Something external has to call this, every minute or two. That schedule IS the
 * punctuality of every delayed step in every sequence.
 *
 * What a missed window costs is lateness, never a lost step: a run that is due sits
 * PENDING until something drains it, and the next pass picks up everything overdue.
 *
 *   npm run cron:workflows
 *
 * Run with --conditions=react-server, like the other cron scripts here, because the
 * engine imports "server-only" which does not resolve under plain tsx.
 */
import { runDueWorkflows } from "../src/lib/workflows/run";

async function main() {
  const summary = await runDueWorkflows();
  console.log(
    `[cron:workflows] claimed ${summary.claimed}, advanced ${summary.advanced}, finished ${summary.finished}, failed ${summary.failed}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[cron:workflows] failed:", e);
    process.exit(1);
  });
