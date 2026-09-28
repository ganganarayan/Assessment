// Deliberately NOT `server-only`: the Railway cron (tsx scripts/sweep-abandoned.ts)
// fires AssessmentAbandoned through here, and that process runs outside Next, where
// the `server-only` package does not resolve at all. Client bundling is still
// impossible — this module pulls in prisma and env, which fail loudly in a browser
// build — so the guard was buying nothing the imports below don't already enforce.
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { tenantCan } from "@/lib/billing/plan-resolve";
import { sendCapiEventVerbose, isCapiConfigured, sendPlatformCapiEvent, isPlatformCapiConfigured } from "@/lib/meta/send";
import { buildPurchaseUserData, PURCHASE_EVENT_NAME } from "@/lib/meta/purchase";
import type { CapiEventInput } from "@/lib/meta/capi";

/** Outcome of a logged CAPI send. Returned so a UI that fires one BY HAND can
 *  report what actually happened, instead of claiming success and leaving the
 *  truth only in the log. Auto callers keep ignoring it (`void …catch()`). */
export interface CapiSendOutcome {
  ok: boolean;
  error?: string;
}

/**
 * Fire a LIFECYCLE Meta CAPI event (opt-in `CompleteRegistration`, completion
 * `AssessmentCompleted`) AND persist the send + Meta's ACTUAL response to the
 * CAPI log — so the log viewer shows, per event, whether Meta accepted it
 * (events_received) or rejected it (status + body). Fire-and-forget safe: never
 * throws. Unlike the old fire-and-forget sendCapiEvent it does not swallow the
 * outcome, which is why "the tester passes but real events don't show" is now
 * diagnosable from the log instead of only Railway stderr.
 */
export async function sendAndLogLifecycleCapi(
  input: CapiEventInput,
  ctx: { tenantId: string | null; submissionId: string | null; name?: string | null },
): Promise<CapiSendOutcome> {
  const base = {
    eventName: input.eventName,
    email: input.user.email ?? null,
    phone: input.user.phone ?? null,
    name: ctx.name ?? null,
    matched: !!ctx.submissionId,
    submissionId: ctx.submissionId,
    tenantId: ctx.tenantId,
    autoFired: true,
    firedAt: new Date(),
  };

  // Billing gate: server-side Conversions API is a Growth+ capability. A tenant without
  // it never reaches Meta (the browser Pixel stays available — that is analyticsTracking,
  // not gated here). Platform/Gita scope (tenantId null) is unlimited and passes.
  if (!(await tenantCan(ctx.tenantId, "capi"))) {
    await prisma.capiLog
      .create({ data: { ...base, status: "failed", response: "Conversions API requires the Growth plan or higher." } })
      .catch(() => {});
    return { ok: false, error: "Conversions API requires the Growth plan or higher." };
  }

  if (!(await isCapiConfigured(ctx.tenantId))) {
    // Record WHY nothing reached Meta, so a missing token is visible in the log.
    await prisma.capiLog
      .create({ data: { ...base, status: "failed", response: "Meta CAPI not configured for this scope." } })
      .catch(() => {});
    return { ok: false, error: "Meta CAPI is not configured for this scope (Settings → Integrations)." };
  }

  const r = await sendCapiEventVerbose(input, ctx.tenantId);
  await prisma.capiLog
    .create({
      data: {
        ...base,
        status: r.ok ? "sent" : "failed",
        httpStatus: r.status ?? null,
        response: (r.response ?? r.error ?? "").slice(0, 800) || null,
      },
    })
    .catch(() => {});
  return r.ok
    ? { ok: true }
    : { ok: false, error: (r.error ?? r.response ?? "Meta rejected the event.").slice(0, 300) };
}

/**
 * Fire a PLATFORM (Assess360 SaaS) CAPI event and persist the send plus Meta's actual
 * response — the sibling of sendAndLogLifecycleCapi for the other pixel.
 *
 * The SaaS funnel used to call sendPlatformCapiEvent directly as `void ….catch(() => {})`,
 * so a signup or subscription reached Meta while the app kept no record of it at all:
 * no row, no response, not even a console line. The Conversions log therefore read 0
 * registrations no matter what Meta received, which is indistinguishable from "nobody
 * signed up" — exactly the gap that makes an app number and a Meta number impossible
 * to reconcile.
 *
 * Rows are written with scope "platform" so they are never confused with an assessment
 * opt-in, which carries the same standard event name. No tenant plan gate applies: this
 * is the app owner's own funnel, not a tenant's. Never throws.
 */
export async function sendAndLogPlatformCapi(
  input: CapiEventInput,
  ctx?: { name?: string | null; amountPaise?: number | null; currency?: string; providerPaymentId?: string | null },
): Promise<CapiSendOutcome> {
  const base = {
    scope: "platform",
    eventName: input.eventName,
    email: input.user.email ?? null,
    phone: input.user.phone ?? null,
    name: ctx?.name ?? null,
    // The SaaS funnel has no Submission to attribute against, so a row is "matched"
    // when it carries an identifier Meta can actually match on.
    matched: !!(input.user.email || input.user.phone),
    submissionId: null,
    tenantId: null,
    amountPaise: ctx?.amountPaise ?? null,
    ...(ctx?.currency ? { currency: ctx.currency } : {}),
    ...(ctx?.providerPaymentId ? { providerPaymentId: ctx.providerPaymentId } : {}),
    autoFired: true,
    firedAt: new Date(),
  };

  if (!(await isPlatformCapiConfigured())) {
    // Record WHY nothing reached Meta, so an unset platform pixel is visible in the
    // log instead of looking like an empty funnel.
    await prisma.capiLog
      .create({ data: { ...base, status: "failed", response: "Platform pixel / CAPI token not configured in Settings." } })
      .catch(() => {});
    return { ok: false, error: "Platform pixel / CAPI token is not configured (super-admin Settings)." };
  }

  const r = await sendPlatformCapiEvent(input);
  await prisma.capiLog
    .create({
      data: {
        ...base,
        status: r.ok ? "sent" : "failed",
        httpStatus: r.status ?? null,
        response: (r.response ?? r.error ?? "").slice(0, 800) || null,
      },
    })
    .catch(() => {});
  return r.ok
    ? { ok: true }
    : { ok: false, error: (r.error ?? r.response ?? "Meta rejected the event.").slice(0, 300) };
}

/** Submission fields a fully-attributed Purchase needs. */
const SUB_SELECT = {
  id: true,
  tenantId: true,
  leadFirstName: true,
  leadLastName: true,
  leadEmail: true,
  leadMobile: true,
  attribution: true,
  fbc: true,
  fbp: true,
  clientIp: true,
  userAgent: true,
  country: true,
  city: true,
  region: true,
  postalCode: true,
  fbclidTimestamp: true,
  metaExternalId: true,
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
  /** Fallback tenant (the webhook's own tenant) when no submission match resolves it. */
  tenantId?: string | null;
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
        tenantId: sub?.tenantId ?? input.tenantId ?? null,
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

  // CAS claim: only fire a row that is pending or failed. Blocks a double-click, or an
  // auto+manual race, from POSTing the same Purchase to Meta twice.
  const claim = await prisma.capiLog.updateMany({
    where: { id: logId, status: { in: ["pending", "failed"] } },
    data: { status: "sending" },
  });
  if (claim.count === 0) return { ok: false, error: "Already sent or in progress." };

  const eventName = opts?.eventNameOverride?.trim() || log.eventName;

  if (!(await isCapiConfigured(log.tenantId))) {
    await prisma.capiLog
      .update({ where: { id: logId }, data: { status: "failed", response: "Meta CAPI is not configured for this tenant (Settings → Integrations)", firedAt: new Date() } })
      .catch(() => {});
    return { ok: false, error: "Meta CAPI is not configured (add the token in Settings → Integrations)." };
  }

  const sub = await findSubmission(log.submissionId, log.email);
  const user = sub ? buildPurchaseUserData(sub) : { email: log.email, phone: log.phone };
  const amountRupees = log.amountPaise != null ? log.amountPaise / 100 : null;

  const r = await sendCapiEventVerbose({
    eventName,
    eventId: log.providerPaymentId,
    // The capture time, not "now" — a late auto/manual fire must carry the real
    // sale time so it stays in Meta's dedup/attribution window.
    eventTimeMs: log.createdAt.getTime(),
    eventSourceUrl: sub?.assessment?.targetUrl ?? env.NEXT_PUBLIC_APP_URL,
    user,
    customData: amountRupees != null ? { value: amountRupees, currency: log.currency || "INR" } : { currency: log.currency || "INR" },
  }, log.tenantId);

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
