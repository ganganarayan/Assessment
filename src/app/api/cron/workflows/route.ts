import { NextResponse } from "next/server";
import { runDueWorkflows } from "@/lib/workflows/run";

/**
 * Workflow queue, driven from outside.
 *   POST /api/cron/workflows   Authorization: Bearer <CRON_SECRET>
 *
 * Its own route rather than a second job folded into the automations one, because the
 * two queues belong to different engines and a failure in one must not stop the other
 * being drained.
 *
 * REQUIRES a scheduled call, every minute or two. That schedule IS the punctuality of
 * every delayed step in every sequence: a run whose step is due at 09:00 goes out on
 * the first pass after 09:00 and not before. Nothing here sleeps or holds a timer, so
 * a missed window costs lateness and never a lost step.
 *
 * Fail-closed when no secret is configured, like the other cron routes.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runDueWorkflows();
  return NextResponse.json({ ok: true, ...summary });
}
