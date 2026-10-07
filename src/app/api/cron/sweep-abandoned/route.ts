import { NextResponse } from "next/server";
import { sweepAbandoned, sweepGateAbandoned } from "@/lib/events/abandoned";
import { sweepCompletedUnpaid } from "@/lib/events/unpaid";

/**
 * Sweep trigger (HTTP). Protected by CRON_SECRET. Runs the same sweeps as the script:
 *   - abandoned (started, never completed past the delay)
 *   - completed_unpaid (completed, no payment after 30 min)
 *   - gate abandoned (passed the page-1 gate, never opted in -> Meta
 *     AssessmentAbandoned / GateIncomplete for retargeting)
 *
 * The gate sweep was missing here while the script had it, so scheduling by URL
 * instead of by Railway Cron silently produced no retargeting events at all - the
 * endpoint answered ok, the audience stayed empty, and nothing said why. Two
 * entrypoints to the same job have to do the same job.
 *   POST /api/cron/sweep-abandoned   Authorization: Bearer <CRON_SECRET>
 *
 * Primary scheduling is Railway Cron running `scripts/sweep-abandoned.ts`. Run it
 * every ~10 min so the 30-min unpaid nudge fires close to on time. Fail-closed
 * if no secret.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [abandoned, unpaid, gate] = await Promise.all([
    sweepAbandoned(),
    sweepCompletedUnpaid(),
    sweepGateAbandoned(),
  ]);
  return NextResponse.json({ ok: true, abandoned, unpaid, gate });
}
