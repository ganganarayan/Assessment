/**
 * Next.js instrumentation - runs once on every server start. Node runtime only.
 *
 *  - Re-arms the CRM resend drip if a batch was left active, so a deploy or restart
 *    never strands a long-running send.
 *  - Starts the automation heartbeat, which is what makes a reminder arrive at all,
 *    and which also sends the trial lifecycle as each message falls due. It lives here
 *    rather than in an external cron because the product cannot depend on somebody
 *    having configured one; see lib/automation/scheduler.ts for why that is safe with
 *    several replicas.
 *  - Starts the trial planner on its OWN clock, because it is the one scheduled job in
 *    this product that can take minutes rather than milliseconds, and the heartbeat
 *    above is a chain that everything else is queued behind.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { resumeDripOnBoot } = await import("@/lib/crm/drip");
    await resumeDripOnBoot();

    const { startAutomationScheduler } = await import("@/lib/automation/scheduler");
    startAutomationScheduler();

    const { startLifecyclePlanner } = await import("@/lib/lifecycle/heartbeat");
    startLifecyclePlanner();
  }
}
