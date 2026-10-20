import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { resolveRazorpayConfig } from "@/lib/settings/config";
import { PLAN_IDS, PLAN_LABEL, PLAN_PRICE_USD, type PlanId } from "@/lib/billing/plans";
import {
  activateSubscription,
  markPastDue,
  endSubscription,
  isPaidPlan,
  setPaidSlots,
  clearPaidSlots,
  SLOT_NOTE_KIND,
  type PaidPlanId,
} from "@/lib/billing/razorpay-subscriptions";
import { firePlatformPurchase } from "@/lib/billing/platform-events";

/**
 * Platform SaaS subscription webhook - POST /api/billing/razorpay.
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
function asCount(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : null;
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
    // Either of the two subscriptions a tenant can hold: the tier, or the client-workspace
    // slots. Looking only at the tier column used to be enough; a slot event would have
    // resolved no tenant and been dropped as a warning.
    const row = await prisma.subscription.findFirst({
      where: {
        OR: [
          { razorpaySubscriptionId },
          { razorpaySlotSubscriptionId: razorpaySubscriptionId },
        ],
      },
      select: { tenantId: true },
    });
    tenantId = row?.tenantId ?? null;
  }
  if (!tenantId) {
    return NextResponse.json({ ok: true, warning: "tenant not resolved" });
  }

  /**
   * CLIENT-WORKSPACE SLOTS, handled before anything else.
   *
   * 🔴 A slot event must NEVER reach activateSubscription below. That function writes
   * `razorpaySubscriptionId` - the TIER's subscription - so routing a slot charge into it
   * would overwrite the tier's id with the slot subscription's, and the tier would stop
   * renewing while the app went on believing it was active. The two are told apart by the
   * note set at creation, with the stored column as the fallback for an event whose notes
   * are missing.
   */
  const slotNote = asStr(notes.kind) === SLOT_NOTE_KIND;
  const slotRow = slotNote
    ? null
    : razorpaySubscriptionId
      ? await prisma.subscription.findFirst({
          where: { tenantId, razorpaySlotSubscriptionId: razorpaySubscriptionId },
          select: { tenantId: true },
        })
      : null;
  if (slotNote || slotRow) {
    if (event === "subscription.activated" || event === "subscription.charged") {
      // The quantity Razorpay charged for is the number of slots that are paid. Reading
      // the charge rather than our own column is what makes a change made in the Razorpay
      // dashboard converge here instead of drifting.
      await setPaidSlots(tenantId, asCount(subEntity.quantity) ?? 1);
      return NextResponse.json({ ok: true, slots: true });
    }
    if (event === "subscription.pending") {
      // A failed slot charge keeps the workspaces running while Razorpay retries, exactly
      // as a failed tier charge keeps the plan. Pulling a client's workspace offline on the
      // first retry would punish the agency's customer for the agency's card.
      return NextResponse.json({ ok: true, slotsPastDue: true });
    }
    // cancelled | halted | completed: the extras are gone.
    await clearPaidSlots(tenantId);
    return NextResponse.json({ ok: true, slotsEnded: true });
  }

  if (event === "subscription.activated" || event === "subscription.charged") {
    // Plan from notes, else the tenant's stored subscription plan.
    let plan = toPaidPlan(notes.plan);
    if (!plan) {
      const row = await prisma.subscription.findUnique({ where: { tenantId }, select: { plan: true } });
      plan = row && isPaidPlan(row.plan as PlanId) ? (row.plan as PaidPlanId) : null;
    }
    if (!plan) return NextResponse.json({ ok: true, warning: "plan not resolved" });

    // The payment id is read BEFORE activation now, because activation records the
    // ledger row and stamps the paid/renewal dates from it. A renewal arriving here
    // is what moves those dates on, so this is the path that keeps them true for the
    // life of the subscription rather than only at the first charge.
    const paymentId = asStr(paymentEntity.id);

    await activateSubscription({
      tenantId,
      plan,
      razorpaySubscriptionId,
      razorpayPlanId: asStr(subEntity.plan_id),
      currentPeriodStart: asDateFromUnix(subEntity.current_start),
      currentPeriodEnd: asDateFromUnix(subEntity.current_end),
      paymentId,
      amountUsd: PLAN_PRICE_USD[plan],
      method: asStr(paymentEntity.method),
    });

    // SaaS funnel: fire Purchase on the platform pixel (server CAPI), keyed by the
    // Razorpay payment id so it dedups with the in-app /verify + browser events.
    if (paymentId) {
      await firePlatformPurchase({
        email: asStr(paymentEntity.email),
        phone: asStr(paymentEntity.contact),
        value: PLAN_PRICE_USD[plan],
        eventId: paymentId,
        planLabel: `Assess360 ${PLAN_LABEL[plan]}`,
      });
    }
    return NextResponse.json({ ok: true, activated: true });
  }

  if (event === "subscription.pending") {
    await markPastDue(tenantId); // charge failed, still retrying - dunning grace
    return NextResponse.json({ ok: true, pastDue: true });
  }

  if (event === "subscription.halted") {
    await endSubscription(tenantId, "HALTED"); // Razorpay gave up retrying - lapsed
    return NextResponse.json({ ok: true, halted: true });
  }

  // subscription.cancelled | subscription.completed
  await endSubscription(tenantId, "CANCELED");
  return NextResponse.json({ ok: true, ended: true });
}
