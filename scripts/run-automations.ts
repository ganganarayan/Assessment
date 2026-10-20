/**
 * Send every automation message that is due. Run by Railway Cron, every minute:
 *   npm run cron:automations
 *
 * A reminder is due at a time, so the resolution of this schedule IS the punctuality of
 * every reminder in the product. Every minute costs one indexed query against
 * (status, dueAt) when there is nothing to do.
 */
import { runDueAutomations } from "../src/lib/automation/run";

async function main() {
  const summary = await runDueAutomations();
  console.log(
    `[cron:automations] claimed ${summary.claimed}, sent ${summary.sent}, skipped ${summary.skipped}, failed ${summary.failed}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[cron:automations] failed:", e);
    process.exit(1);
  });
