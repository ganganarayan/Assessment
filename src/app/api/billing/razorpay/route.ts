import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { resolveRazorpayConfig } from "@/lib/settings/config";
import { PLAN_IDS, type PlanId } from "@/lib/billing/plans";
import {
  activateSubscription,
  markPastDue,
  endSubscription,
  isPaidPlan,
  type PaidPlanId,
} from "@/lib/billing/razorpay-subscriptions";

/**
 * Platform SaaS subscription webhook — POST /api/billing/razorpay.
 *
 * Razorpay (the platform-owner's account) calls this for subscription lifecycle
 * events. Verified with the PLATFORM webhook secret (app settings singleton → env).
 * This is the SOURCE OF TRUTH for activation/renewal/cancellation; the in-app /verify
 * only fast-paths the first activation. Kept SEPARATE from the Gita funnel webhook
 * (/api/payments/razorpay) so USD subscription money never touches the INR purchase
 * pipeline.
 *
 * Razorpay Dashboard → Webhooks:
 *   URL:    https://<app>/api/billing/razorpay
 *   Events: subscription.activated, subscription.charged, subscription.pending,
 *           subscription.halted, subscription.cancelled, subscription.completed
 */
export const dynamic = "force-dynamic";

const HANDLED = [
  "subscription.activated",
  "subscription.charged",
  "subscription.pending",
  "subscription.halted",
  "subscription.cancelled",
  "subscription.completed",
];

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function asStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function asDateFromUnix(v: unknown): Date | null {
  return typeof v === "number" && Number.isFinite(v) ? new Date(v * 1000) : null;
}
function toPaidPlan(v: unknown): PaidPlanId | null {
  const s = asStr(v);
  if (!s || !(PLAN_IDS as readonly string[]).includes(s)) return null;
  const plan = s as PlanId;
  return isPaidPlan(plan) ? plan : null;
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  const eventId = req.headers.get("x-razorpay-event-id");

  const { webhookSecret } = await resolveRazorpayConfig(null);
  if (!verifyWebhookSignature(raw, signature, webhookSecret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = asObj(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const event = asStr(body.event);
  if (!event || !HANDLED.includes(event)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Idempotency: every Razorpay event id is recorded once; a redelivery is a no-op.
  if (eventId) {
    try {
      await prisma.billingEvent.create({ data: { eventId, type: event } });
    } catch {
      return NextResponse.json({ ok: true, duplicate: true });
    }
  }

  const payload = asObj(body.payload);
  const subEntity = asObj(asObj(payload.subscription).entity);
  const paymentEntity = asObj(asObj(payload.payment).entity);
  const notes = asObj(subEntity.notes);

  const razorpaySubscriptionId = asStr(subEntity.id) ?? asStr(paymentEntity.subscription_id);

  // Resolve the tenant: prefer the notes we set at creation, else our stored row.
  let tenantId = asStr(notes.tenantId);
  if (!tenantId && razorpaySubscriptionId) {
    const row = await prisma.subscription.findFirst({
      where: { razorpaySubscriptionId },
      select: { tenantId: true },
    });
    tenantId = row?.tenantId ?? null;
  }
  if (!tenantId) {
    return NextResponse.json({ ok: true, warning: "tenant not resolved" });
  }

  if (event === "subscription.activated" || event === "subscription.charged") {
    // Plan from notes, else the tenant's stored subscription plan.
    let plan = toPaidPlan(notes.plan);
    if (!plan) {
      const row = await prisma.subscription.findUnique({ where: { tenantId }, select: { plan: true } });
      plan = row && isPaidPlan(row.plan as PlanId) ? (row.plan as PaidPlanId) : null;
    }
    if (!plan) return NextResponse.json({ ok: true, warning: "plan not resolved" });

    await activateSubscription({
      tenantId,
      plan,
      razorpaySubscriptionId,
      razorpayPlanId: asStr(subEntity.plan_id),
      currentPeriodStart: asDateFromUnix(subEntity.current_start),
      currentPeriodEnd: asDateFromUnix(subEntity.current_end),
    });
    return NextResponse.json({ ok: true, activated: true });
  }

  if (event === "subscription.pending") {
    await markPastDue(tenantId); // charge failed, still retrying — dunning grace
    return NextResponse.json({ ok: true, pastDue: true });
  }

  if (event === "subscription.halted") {
    await endSubscription(tenantId, "HALTED"); // Razorpay gave up retrying — lapsed
    return NextResponse.json({ ok: true, halted: true });
  }

  // subscription.cancelled | subscription.completed
  await endSubscription(tenantId, "CANCELED");
  return NextResponse.json({ ok: true, ended: true });
}
