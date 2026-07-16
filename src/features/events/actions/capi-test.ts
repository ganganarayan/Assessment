"use server";

import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { requireSuperAdmin, assertCanEditOrThrow } from "@/lib/auth/guards";
import { testCapi, sendCapiEventVerbose } from "@/lib/meta/send";
import { buildPurchaseUserData, PURCHASE_EVENT_NAME } from "@/lib/meta/purchase";
import { fireCapiLogRow } from "@/lib/meta/capi-log";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { formatIST } from "@/lib/date";

/** Super-admin diagnostic: fire a server-side CAPI event (any name, default
 *  AssessmentCompleted) to Meta and return Meta's real response. */
export async function testMetaCapi(testEventCode?: string, eventName?: string) {
  assertCanEditOrThrow(await requireSuperAdmin());
  return testCapi(testEventCode, eventName);
}

/**
 * Recovery: re-send the REAL purchase conversion for one paid submission to Meta
 * (e.g. a sale whose buyer never returned, so CAPI never fired). Uses the Razorpay
 * payment id as event_id (so it dedups against any later fire) and the payment's
 * own time (must be within Meta's 7-day window). Returns Meta's actual response.
 */
export async function resendPurchaseToMeta(submissionId: string, force = false): Promise<{
  ok: boolean;
  status?: number;
  response?: string;
  error?: string;
  eventName?: string;
  eventId?: string;
}> {
  assertCanEditOrThrow(await requireSuperAdmin());
  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      resultToken: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      attribution: true,
      fbc: true,
      fbp: true,
      clientIp: true,
      userAgent: true,
      fbclidTimestamp: true,
      createdAt: true,
      assessment: { select: { slug: true, targetUrl: true, paymentAmount: true, paymentEventName: true } },
    },
  });
  if (!s?.assessment) return { ok: false, error: "Submission or assessment not found." };

  const p = await prisma.payment.findFirst({
    where: { submissionId, purpose: "assessment_unlock", status: { in: ["captured", "paid"] }, providerPaymentId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { providerPaymentId: true, amount: true, currency: true, createdAt: true, metaConversionAt: true },
  });
  if (!p?.providerPaymentId) return { ok: false, error: "No captured payment found for this submission." };

  const eventName = s.assessment.paymentEventName || "Purchase121";
  // Backstop: don't re-send an already-confirmed conversion UNLESS forced (e.g. to
  // re-fire with the click id now attached). Meta dedups by event_id either way.
  if (p.metaConversionAt && !force) {
    return {
      ok: false,
      error: `Already sent to Meta on ${formatIST(p.metaConversionAt)} IST — no action needed.`,
      eventName,
      eventId: p.providerPaymentId,
    };
  }
  const amountRupees = s.assessment.paymentAmount ?? (p.amount != null ? p.amount / 100 : null);
  const base = s.assessment.targetUrl && s.resultToken
    ? (() => {
        try {
          const u = new URL(s.assessment.targetUrl);
          u.searchParams.set("t", s.resultToken);
          return u.toString();
        } catch {
          return `${env.NEXT_PUBLIC_APP_URL}/a/${s.assessment.slug}/r/${submissionId}`;
        }
      })()
    : `${env.NEXT_PUBLIC_APP_URL}/a/${s.assessment.slug}/r/${submissionId}`;
  const r = await sendCapiEventVerbose({
    eventName,
    eventId: p.providerPaymentId,
    eventTimeMs: p.createdAt.getTime(),
    eventSourceUrl: base,
    // Full match signals (email/phone/name + fbc/fbp/ip/UA).
    user: buildPurchaseUserData(s),
    customData: amountRupees != null ? { value: amountRupees, currency: p.currency || "INR" } : { currency: p.currency || "INR" },
  });
  if (r.ok) {
    await prisma.payment
      .updateMany({ where: { providerPaymentId: p.providerPaymentId, metaConversionAt: null }, data: { metaConversionAt: new Date() } })
      .catch(() => {});
  }
  return { ...r, eventName, eventId: p.providerPaymentId };
}

/**
 * Manual recovery for an EXTERNAL payment (no in-app Payment row): fire the
 * standard `Purchase` to Meta for a Razorpay payment id + buyer email. Pulls full
 * attribution from the most recent COMPLETED submission for that email (fbc/fbp/
 * ip/UA); if none matches it still fires on email+phone alone. event_id = the
 * payment id, so it dedups against the browser Purchase on the thank-you page.
 * Returns Meta's actual response. Fire ONCE per payment.
 */
export async function resendPurchaseByEmail(input: {
  paymentId: string;
  email: string;
  phone?: string;
  amountRupees: number;
}): Promise<{ ok: boolean; status?: number; response?: string; error?: string; matched: boolean; eventId: string }> {
  assertCanEditOrThrow(await requireSuperAdmin());
  const paymentId = input.paymentId.trim();
  const email = input.email.trim().toLowerCase();
  const phone = (input.phone ?? "").trim() || null;
  if (!paymentId || !email) return { ok: false, error: "payment_id and email are required.", matched: false, eventId: paymentId };

  // Record (or reuse) a CapiLog row so the fire is CAS-guarded + logged: a second
  // click / another operator can't double-send (fireCapiLogRow only fires a row that
  // is pending|failed, and pulls full attribution by email inside).
  const existing = await prisma.capiLog.findUnique({ where: { providerPaymentId: paymentId }, select: { id: true } });
  const rowId =
    existing?.id ??
    (
      await prisma.capiLog.create({
        data: {
          providerPaymentId: paymentId,
          email,
          phone,
          amountPaise: Math.round(input.amountRupees * 100),
          currency: "INR",
          eventName: PURCHASE_EVENT_NAME,
          status: "pending",
        },
        select: { id: true },
      })
    ).id;

  const r = await fireCapiLogRow(rowId, { auto: false });
  const after = await prisma.capiLog.findUnique({ where: { id: rowId }, select: { matched: true } });
  return { ...r, matched: after?.matched ?? false, eventId: paymentId };
}

/* ------------------------------------------------- CAPI log (auto + manual) --- */

/** Manually fire (or re-fire) a logged capture, optionally overriding the event
 *  name for that row (e.g. a high-ticket sale). Records Meta's response on the row. */
export async function fireCapiLog(logId: string, eventNameOverride?: string) {
  assertCanEditOrThrow(await requireSuperAdmin());
  return fireCapiLogRow(logId, { auto: false, eventNameOverride });
}

export interface PurchaseSettingsForm {
  autoFireAmounts: string; // CSV of rupee amounts
  highTicketThreshold: number;
  highTicketEventName: string;
}

export async function getPurchaseSettingsForm(): Promise<PurchaseSettingsForm> {
  await requireSuperAdmin();
  const s = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: { purchaseAutoFireAmounts: true, purchaseHighTicketThreshold: true, purchaseHighTicketEventName: true },
  });
  return {
    autoFireAmounts: s?.purchaseAutoFireAmounts ?? "199,499,999,1000",
    highTicketThreshold: s?.purchaseHighTicketThreshold ?? 4000,
    highTicketEventName: s?.purchaseHighTicketEventName ?? "Purchase",
  };
}

export async function savePurchaseSettings(form: PurchaseSettingsForm): Promise<ActionResult> {
  assertCanEditOrThrow(await requireSuperAdmin());
  const amounts = (form.autoFireAmounts ?? "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  const threshold = Math.max(0, Math.floor(Number(form.highTicketThreshold) || 0));
  const eventName = (form.highTicketEventName ?? "").trim();
  if (!eventName) return { ok: false, error: "High-ticket event name is required." };
  if (!/^[A-Za-z0-9_]+$/.test(eventName)) {
    return { ok: false, error: "Event name: letters, digits, underscore only (Meta event name)." };
  }
  await prisma.appSetting.upsert({
    where: { id: "singleton" },
    update: {
      purchaseAutoFireAmounts: amounts.join(","),
      purchaseHighTicketThreshold: threshold,
      purchaseHighTicketEventName: eventName,
    },
    create: {
      id: "singleton",
      purchaseAutoFireAmounts: amounts.join(","),
      purchaseHighTicketThreshold: threshold,
      purchaseHighTicketEventName: eventName,
    },
  });
  return { ok: true };
}
