import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/nurture/send";
import { supportEmailFor } from "@/lib/billing/gate";
import { formatISTDate } from "@/lib/date";
import { PLAN_LABEL, type BillingTerm, type PlanId } from "@/lib/billing/plans";

/**
 * The billing emails a workspace owner receives: one per charge (subscribed, upgraded,
 * downgraded, renewed) and one when a plan is cancelled.
 *
 * Added 12-11-2026 with the Rs 1.x test rows, because the owner's test is "it should
 * actually email" and nothing in billing sent mail before: `customer_notify: 0` silences
 * Razorpay's own, so a customer who paid heard nothing from anyone.
 *
 * Sent from the PLATFORM sender (tenantId null), to the workspace's first owner login.
 * Best-effort throughout: a payment that went through must never fail on its receipt.
 */

export type BillingChangeKind = "subscribed" | "upgraded" | "downgraded" | "renewed" | "active" | "cancelled";

const RANK: Record<PlanId, number> = { GATE: 1, SIGNAL: 2, AGENCY: 3, ENTERPRISE: 4 };

/** Pure: what a charge did, from what was held before and whether this subscription had charged already. */
export function billingChangeKind(previous: PlanId | null, next: PlanId, chargedBefore: boolean): BillingChangeKind {
  if (chargedBefore) return "renewed";
  if (!previous) return "subscribed";
  if (RANK[next] > RANK[previous]) return "upgraded";
  if (RANK[next] < RANK[previous]) return "downgraded";
  return "active";
}

const SUBJECT: Record<BillingChangeKind, (plan: string) => string> = {
  subscribed: (p) => `You're on Assess360 ${p}`,
  upgraded: (p) => `Upgraded to Assess360 ${p}`,
  downgraded: (p) => `Your plan is now Assess360 ${p}`,
  renewed: (p) => `Assess360 ${p} renewed`,
  active: (p) => `Assess360 ${p} is active`,
  cancelled: (p) => `Your Assess360 ${p} plan is cancelled`,
};

const LEAD: Record<BillingChangeKind, (plan: string, previous: string | null) => string> = {
  subscribed: (p) => `Thank you. Your workspace is now on the <strong>${p}</strong> plan and every ${p} feature is open.`,
  // Owner wording, 12-11-2026: name the plan that was cancelled and the one replacing it.
  upgraded: (p, prev) =>
    prev
      ? `Your <strong>${prev}</strong> plan is cancelled and your workspace is upgraded to the <strong>${p}</strong> plan. The extra features are open now.`
      : `Your workspace is upgraded to the <strong>${p}</strong> plan. The extra features are open now.`,
  downgraded: (p, prev) =>
    prev
      ? `Your <strong>${prev}</strong> plan is cancelled and your workspace is downgraded to the <strong>${p}</strong> plan. Features above ${p} are switched off; nothing you built has been deleted.`
      : `Your workspace is downgraded to the <strong>${p}</strong> plan. Features above ${p} are switched off; nothing you built has been deleted.`,
  renewed: (p) => `Your <strong>${p}</strong> plan has renewed.`,
  active: (p) => `Your <strong>${p}</strong> plan is active.`,
  cancelled: (p) => `Your <strong>${p}</strong> plan is cancelled and you will not be charged again.`,
};

export interface BillingEmailInput {
  tenantId: string;
  kind: BillingChangeKind;
  plan: PlanId;
  /** "USD 79" or "INR 1.20 (test charge)". Null leaves the line out. */
  amountText?: string | null;
  paymentId?: string | null;
  renewsAt?: Date | null;
  /** For a cancellation: when access stops. Null means it already has. */
  endsAt?: Date | null;
  /** True when the downgrade costs nothing today and the lower amount starts at renewal. */
  noChargeToday?: boolean;
  /** The plan held before this change, named as cancelled in an upgrade or downgrade. */
  previousPlan?: PlanId | null;
  /** The billing cycle, for the "charged monthly / yearly until you cancel" line. */
  term?: BillingTerm;
  /** What each cycle charges from now on, e.g. "USD 79" or "INR 1.20". */
  recurringAmountText?: string | null;
}

export async function sendBillingEmail(input: BillingEmailInput): Promise<void> {
  try {
    const owner = await prisma.user.findFirst({
      where: { tenantId: input.tenantId, deletedAt: null, staffPermission: null },
      orderBy: { createdAt: "asc" },
      select: { email: true, name: true },
    });
    if (!owner?.email) {
      console.error(`[billing-email] no owner login for tenant ${input.tenantId}, ${input.kind} email not sent`);
      return;
    }
    const label = PLAN_LABEL[input.plan];
    const base = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
    const support = await supportEmailFor(null);

    const rows: string[] = [];
    rows.push(`<li>Plan: <strong>${label}</strong></li>`);
    if (input.amountText) rows.push(`<li>Charged: ${input.amountText}</li>`);
    if (input.noChargeToday) rows.push(`<li>Charged today: nothing. The new amount applies from your next renewal.</li>`);
    if (input.paymentId) rows.push(`<li>Payment reference: ${input.paymentId}</li>`);
    if (input.renewsAt && input.kind !== "cancelled") rows.push(`<li>Next renewal: ${formatISTDate(input.renewsAt)}</li>`);
    if (input.kind === "cancelled") {
      rows.push(
        input.endsAt
          ? `<li>Access until: ${formatISTDate(input.endsAt)}</li>`
          : `<li>Access: ended today</li>`,
      );
    }

    const previous = input.previousPlan && input.previousPlan !== input.plan ? PLAN_LABEL[input.previousPlan] : null;
    const cycle = input.term === "YEARLY" ? "yearly" : "monthly";
    // Every email except the cancellation says the subscription keeps charging, because
    // that is the one fact a customer must not learn from their statement first.
    const recurring =
      input.kind === "cancelled"
        ? ""
        : `<p>Until you cancel, your payment method will be charged ${
            input.recurringAmountText ? `<strong>${input.recurringAmountText}</strong> ` : ""
          }${cycle}, as per the subscription you have taken. You can cancel any time from Billing.</p>`;

    const html = `<p>Hi ${(owner.name ?? "").trim() || "there"},</p>
<p>${LEAD[input.kind](label, previous)}</p>
<ul>${rows.join("")}</ul>
${recurring}
<p><a href="${base}/w/billing">Open billing</a></p>
${support ? `<p>Questions? Email <a href="mailto:${support}">${support}</a>.</p>` : ""}`;

    const err = await sendEmail(null, owner.email, SUBJECT[input.kind](label), html);
    if (err) console.error(`[billing-email] ${input.kind} send failed:`, err);
  } catch (e) {
    console.error("[billing-email] unexpected:", e instanceof Error ? e.message : String(e));
  }
}
