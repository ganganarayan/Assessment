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
import { sweepWorkflowRetention } from "../src/lib/workflows/retention";

async function main() {
  const summary = await runDueWorkflows();
  console.log(
    `[cron:workflows] claimed ${summary.claimed}, advanced ${summary.advanced}, finished ${summary.finished}, failed ${summary.failed}`,
  );

  // The sweep rides along with the drain rather than being a second job to configure.
  // Both deletes are indexed predicates that normally match nothing, so the cost of
  // running it every pass is a great deal lower than the cost of it being a schedule
  // somebody forgot to set up - which is exactly how the table started leaking.
  const swept = await sweepWorkflowRetention();
  if (swept.deadRuns || swept.deletedRuns || swept.deletedSends) {
    console.log(
      `[cron:workflows] swept ${swept.deadRuns} overdue, deleted ${swept.deletedRuns} finished runs and ${swept.deletedSends} send rows`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[cron:workflows] failed:", e);
    process.exit(1);
  });
