/**
 * Next.js instrumentation - runs once on every server start. Node runtime only.
 *
 *  - Re-arms the CRM resend drip if a batch was left active, so a deploy or restart
 *    never strands a long-running send.
 *  - Starts the automation heartbeat, which is what makes a reminder arrive at all.
 *    It lives here rather than in an external cron because the product cannot depend on
 *    somebody having configured one; see lib/automation/scheduler.ts for why that is
 *    safe with several replicas.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { resumeDripOnBoot } = await import("@/lib/crm/drip");
    await resumeDripOnBoot();

    const { startAutomationScheduler } = await import("@/lib/automation/scheduler");
    startAutomationScheduler();
  }
}
