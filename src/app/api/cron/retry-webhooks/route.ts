import { NextResponse } from "next/server";
import { retryPendingWebhooks } from "@/lib/webhooks/retry";

/**
 * Webhook retry trigger (HTTP). Protected by CRON_SECRET. Re-attempts any queued
 * WebhookDelivery rows that are due (failed earlier or whose inline attempt was
 * killed by a deploy).
 *   POST /api/cron/retry-webhooks   Authorization: Bearer <CRON_SECRET>
 *
 * Primary scheduling is Railway Cron running `scripts/retry-webhooks.ts` every
 * ~1–2 min so the first retry (+2 min) fires close to on time. Fail-closed if no
 * secret is configured.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await retryPendingWebhooks();
  return NextResponse.json({ ok: true, ...r });
}
