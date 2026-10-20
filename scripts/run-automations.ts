/**
 * Send every automation message that is due, once, and exit.
 *
 * 🟡 OPTIONAL, and not how reminders normally go out: the app carries its own scheduler
 * (lib/automation/scheduler.ts), started on every server boot, because the product
 * cannot depend on an external cron being configured for thousands of tenants. This
 * script is for draining the queue by hand, or from any scheduler somebody does happen
 * to have:
 *   npm run cron:automations
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
