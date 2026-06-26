/**
 * Next.js instrumentation — runs once on every server start. Re-arms the CRM
 * resend drip if a batch was left active (so a deploy/restart never strands a
 * long-running send). Node runtime only.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { resumeDripOnBoot } = await import("@/lib/crm/drip");
    await resumeDripOnBoot();
  }
}
