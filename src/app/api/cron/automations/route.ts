import { NextResponse } from "next/server";
import { runDueAutomations } from "@/lib/automation/run";

/**
 * Automation trigger (HTTP). Protected by CRON_SECRET.
 *   POST /api/cron/automations   Authorization: Bearer <CRON_SECRET>
 *
 * Primary scheduling is Railway Cron running `npm run cron:automations` every minute.
 * A reminder is only as punctual as this job, which is why it is its own schedule and
 * not folded into the webhook retry: a queue of failed deliveries must never be what
 * delays somebody's "your call is in an hour".
 *
 * Fail-closed when no secret is configured.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runDueAutomations();
  return NextResponse.json({ ok: true, ...summary });
}
