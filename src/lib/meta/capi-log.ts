import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { sendCapiEventVerbose, isCapiConfigured } from "@/lib/meta/send";
import { buildPurchaseUserData, PURCHASE_EVENT_NAME } from "@/lib/meta/purchase";

/** Submission fields a fully-attributed Purchase needs. */
const SUB_SELECT = {
  id: true,
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
  assessment: { select: { targetUrl: true } },
} as const;

export interface PurchaseSettings {
  autoFireAmounts: number[]; // rupees
  highTicketThreshold: number; // rupees
  highTicketEventName: string;
}

/** Parse a CSV of rupee amounts into a positive-integer list. */
export function parseAmounts(csv: string | null | undefined): number[] {
  return (csv ?? "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export async function loadPurchaseSettings(): Promise<PurchaseSettings> {
  const s = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: { purchaseAutoFireAmounts: true, purchaseHighTicketThreshold: true, purchaseHighTicketEventName: true },
  });
  return {
    autoFireAmounts: parseAmounts(s?.purchaseAutoFireAmounts ?? "199,499,999,1000"),
    highTicketThreshold: s?.purchaseHighTicketThreshold ?? 4000,
    highTicketEventName: s?.purchaseHighTicketEventName || PURCHASE_EVENT_NAME,
  };
}

/** The event name for an amount + whether it should auto-fire. */
export function resolvePurchasePlan(
  amountRupees: number | null,
  s: PurchaseSettings,
): { eventName: string; autoFire: boolean } {
  if (amountRupees == null) return { eventName: PURCHASE_EVENT_NAME, autoFire: false };
  const eventName = amountRupees > s.highTicketThreshold ? s.highTicketEventName : PURCHASE_EVENT_NAME;
  return { eventName, autoFire: s.autoFireAmounts.includes(amountRupees) };
}

/** Attribution source: the in-app submission by id, else the latest completed by email. */
async function findSubmission(submissionId: string | null, email: string | null) {
  if (submissionId) {
    const s = await prisma.submission.findUnique({ where: { id: submissionId }, select: SUB_SELECT });
    if (s) return s;
  }
  const norm = email?.trim().toLowerCase();
  if (norm) {
    return prisma.submission.findFirst({
      where: { status: "COMPLETED", leadEmail: { equals: norm, mode: "insensitive" } },
      orderBy: { completedAt: "desc" },
      select: SUB_SELECT,
    });
  }
  return null;
}

/**
 * Record a captured payment in the CAPI log and, if its amount is in the auto-fire
 * list, fire the Purchase to Meta immediately. Deduped by the Razorpay payment id.
 * Every other amount is left `pending` for manual firing from the log viewer.
 */
export async function recordCapture(input: {
  providerPaymentId: string;
  email: string | null;
  phone: string | null;
  amountPaise: number | null;
  currency: string;
  submissionId: string | null;
}): Promise<void> {
  const existing = await prisma.capiLog.findUnique({ where: { providerPaymentId: input.providerPaymentId }, select: { id: true } });
  if (existing) return;

  const amountRupees = input.amountPaise != null ? Math.round(input.amountPaise / 100) : null;
  const settings = await loadPurchaseSettings();
  const plan = resolvePurchasePlan(amountRupees, settings);
  const sub = await findSubmission(input.submissionId, input.email);
  const name = sub ? [sub.leadFirstName, sub.leadLastName].filter(Boolean).join(" ") || null : null;

  let rowId: string;
  try {
    const row = await prisma.capiLog.create({
      data: {
        providerPaymentId: input.providerPaymentId,
        email: input.email ?? sub?.leadEmail ?? null,
        phone: input.phone ?? sub?.leadMobile ?? null,
        name,
        amountPaise: input.amountPaise,
        currency: input.currency,
        eventName: plan.eventName,
        matched: !!sub,
        submissionId: sub?.id ?? input.submissionId ?? null,
        status: "pending",
      },
      select: { id: true },
    });
    rowId = row.id;
  } catch {
    return; // unique race — another handler recorded it
  }

  if (plan.autoFire) {
    await fireCapiLogRow(rowId, { auto: true }).catch(() => {});
  }
}

/**
 * Fire (or re-fire) the Purchase for a CAPI log row and record Meta's actual
 * response on the row. Used by the auto path and the manual "Fire to Meta" button.
 * event_id = the payment id, so Meta dedups against the browser Purchase.
 */
export async function fireCapiLogRow(
  logId: string,
  opts?: { auto?: boolean; eventNameOverride?: string },
): Promise<{ ok: boolean; status?: number; response?: string; error?: string }> {
  const log = await prisma.capiLog.findUnique({ where: { id: logId } });
  if (!log) return { ok: false, error: "Log row not found." };
  if (!log.providerPaymentId) return { ok: false, error: "No payment id on this row." };

  const eventName = opts?.eventNameOverride?.trim() || log.eventName;

  if (!isCapiConfigured()) {
    await prisma.capiLog
      .update({ where: { id: logId }, data: { status: "failed", response: "META_CAPI_ACCESS_TOKEN not set on this environment", firedAt: new Date() } })
      .catch(() => {});
    return { ok: false, error: "META_CAPI_ACCESS_TOKEN is not set on this environment." };
  }

  const sub = await findSubmission(log.submissionId, log.email);
  const user = sub ? buildPurchaseUserData(sub) : { email: log.email, phone: log.phone };
  const amountRupees = log.amountPaise != null ? log.amountPaise / 100 : null;

  const r = await sendCapiEventVerbose({
    eventName,
    eventId: log.providerPaymentId,
    eventTimeMs: Date.now(),
    eventSourceUrl: sub?.assessment?.targetUrl ?? env.NEXT_PUBLIC_APP_URL,
    user,
    customData: amountRupees != null ? { value: amountRupees, currency: log.currency || "INR" } : { currency: log.currency || "INR" },
  });

  await prisma.capiLog
    .update({
      where: { id: logId },
      data: {
        eventName,
        matched: !!sub,
        status: r.ok ? "sent" : "failed",
        httpStatus: r.status ?? null,
        response: (r.response ?? r.error ?? "").slice(0, 800) || null,
        autoFired: opts?.auto ?? log.autoFired,
        firedAt: new Date(),
      },
    })
    .catch(() => {});

  if (r.ok) {
    await prisma.payment
      .updateMany({ where: { providerPaymentId: log.providerPaymentId, metaConversionAt: null }, data: { metaConversionAt: new Date() } })
      .catch(() => {});
  }
  return r;
}
