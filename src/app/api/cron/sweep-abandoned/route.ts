import { NextResponse } from "next/server";
import { sweepAbandoned } from "@/lib/events/abandoned";

/**
 * Abandonment sweep trigger (HTTP). Protected by CRON_SECRET.
 *   POST /api/cron/sweep-abandoned   Authorization: Bearer <CRON_SECRET>
 *
 * Primary scheduling is Railway Cron running `scripts/sweep-abandoned.ts`; this
 * route exists for manual runs / external schedulers. Fail-closed if no secret.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sweepAbandoned();
  return NextResponse.json({ ok: true, ...result });
}
