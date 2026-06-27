import { NextResponse } from "next/server";
import { sweepAbandoned } from "@/lib/events/abandoned";
import { sweepCompletedUnpaid } from "@/lib/events/unpaid";

/**
 * Sweep trigger (HTTP). Protected by CRON_SECRET. Runs BOTH sweeps:
 *   - abandoned (started, never completed past the delay)
 *   - completed_unpaid (completed, no payment after 30 min)
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

  const [abandoned, unpaid] = await Promise.all([sweepAbandoned(), sweepCompletedUnpaid()]);
  return NextResponse.json({ ok: true, abandoned, unpaid });
}
