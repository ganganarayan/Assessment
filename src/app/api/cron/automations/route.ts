import { NextResponse } from "next/server";
import { runDueAutomations } from "@/lib/automation/run";

/**
 * Automation trigger (HTTP). Protected by CRON_SECRET.
 *   POST /api/cron/automations   Authorization: Bearer <CRON_SECRET>
 *
 * 🟡 OPTIONAL. The app schedules itself (lib/automation/scheduler.ts starts a heartbeat
 * on every server boot), because a product running for thousands of tenants cannot
 * depend on somebody having configured a cron. This endpoint stays as a way to kick the
 * queue from outside - after a host has had the process parked, or to drain it by hand
 * while watching the result.
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
