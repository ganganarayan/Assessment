import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { recordCapture } from "@/lib/meta/capi-log";
import { asRazorpayAccount } from "@/lib/settings/config";

/**
 * Booking a payment-link sale. ONE place, called by both paths that can learn about
 * it: the browser's return from Checkout (/api/pay/link/verify) and the Razorpay
 * webhook. Either may arrive first, or alone - a respondent who closes the tab still
 * paid, and a webhook that is late must not produce a second sale.
 *
 * Idempotency has two locks:
 *   - the Payment row is upserted on the unique providerPaymentId, so the same
 *     payment can be reported twice and recorded once;
 *   - the link is flipped CREATED → PAID with a conditional updateMany, so exactly
 *     one caller wins the flip however they race.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: fire completed_paid, or stamp the submission as
 * paid. This is the FINAL PRODUCT sale, not the ₹199-₹1008 consultation unlock the
 * funnel sells, and mixing them would let a hand-sold package report as a funnel
 * conversion - which quietly flatters cost-per-sale on the one number the ad account
 * is steered by. The Purchase CAPI below is fired, because that is exactly the signal
 * Meta needs: the same pixel that already received CompleteRegistration and
 * QualifiedCompletion for this person now learns what they actually bought.
 */

/** The link fields the settle path needs, in one shape for both callers. */
export interface SettleLinkInput {
  id: string;
  /** Null = the platform's own funnels, the convention every money row here uses. */
  tenantId: string | null;
  submissionId: string;
  assessmentId: string | null;
  account: string;
}

/**
 * Record the sale. Returns true when THIS call was the one that flipped the link to
 * PAID (useful only for logging - both callers behave the same either way).
 */
export async function settlePaymentLink(input: {
  link: SettleLinkInput;
  providerPaymentId: string;
  providerOrderId: string | null;
  amountPaise: number | null;
  currency?: string;
  /** Which code path recorded it, for the audit trail on the Payment row. */
  event: string;
  /** Lead details for Meta's match keys; null when the caller has not loaded them. */
  customer?: { email: string | null; phone: string | null };
}): Promise<boolean> {
  const { link } = input;
  const account = asRazorpayAccount(link.account);
  const currency = input.currency ?? "INR";

  await prisma.payment
    .upsert({
      where: { providerPaymentId: input.providerPaymentId },
      create: {
        provider: "razorpay",
        providerPaymentId: input.providerPaymentId,
        providerOrderId: input.providerOrderId,
        providerAccount: account,
        purpose: "product_sale",
        submissionId: link.submissionId,
        amount: input.amountPaise,
        currency,
        status: "captured",
        event: input.event,
        notes: { submissionId: link.submissionId, paymentLinkId: link.id } as Prisma.InputJsonValue,
        tenantId: link.tenantId,
        assessmentId: link.assessmentId,
      },
      // A row may already exist from the other path. Keep it authoritative on the
      // fields that identify the sale, and never downgrade a recorded amount to null.
      update: {
        providerOrderId: input.providerOrderId ?? undefined,
        providerAccount: account,
        purpose: "product_sale",
        submissionId: link.submissionId,
        status: "captured",
        amount: input.amountPaise ?? undefined,
        tenantId: link.tenantId,
        assessmentId: link.assessmentId,
      },
    })
    .catch((e: unknown) => {
      console.error("[pay-link] payment upsert failed:", e instanceof Error ? e.message : String(e));
    });

  // Spend the link. Conditional on CREATED, so a second caller flips nothing and a
  // cancelled link is never resurrected by a late webhook.
  const flipped = await prisma.paymentLink
    .updateMany({
      where: { id: link.id, status: "CREATED" },
      data: {
        status: "PAID",
        providerPaymentId: input.providerPaymentId,
        providerOrderId: input.providerOrderId ?? undefined,
        paidPaise: input.amountPaise ?? undefined,
        paidAt: new Date(),
      },
    })
    .catch(() => ({ count: 0 }));

  // Purchase to Meta, on the pixel this person's funnel reports to - recordCapture
  // resolves it from the submission's own assessment, so a workspace running several
  // ad accounts still teaches the right one. Deduped by the payment id, and subject to
  // the owner's auto-fire amount rules exactly like a funnel sale.
  void recordCapture({
    providerPaymentId: input.providerPaymentId,
    email: input.customer?.email ?? null,
    phone: input.customer?.phone ?? null,
    amountPaise: input.amountPaise,
    currency,
    submissionId: link.submissionId,
    tenantId: link.tenantId,
  }).catch(() => {});

  return flipped.count === 1;
}

/**
 * The host a pay link is published on.
 *
 * A VERIFIED custom domain wins, so a tenant's client sees the tenant's own address
 * on the page that asks them for money rather than the platform's. Verified means
 * Railway has issued the certificate, which is the only state in which the host
 * actually serves - an unverified domain would produce a link that cannot be opened,
 * and a dead payment link is worse than an off-brand one. Everything else falls back
 * to the app's own URL.
 */
export async function payBaseUrl(tenantId: string | null): Promise<string> {
  if (!tenantId) return env.NEXT_PUBLIC_APP_URL;
  try {
    const d = await prisma.domain.findFirst({
      where: { tenantId, verified: true },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { hostname: true },
    });
    if (d?.hostname) return `https://${d.hostname}`;
  } catch {
    /* fall through to the app URL */
  }
  return env.NEXT_PUBLIC_APP_URL;
}
