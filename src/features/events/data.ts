import "server-only";
import { prisma } from "@/lib/db/prisma";
import { EVENT_LABEL } from "@/features/events/types";
import type { WebhookRow, EventActivityRow } from "@/features/events/types";
import { ownedWhere } from "@/lib/tenant/platform-tenant";

/** Webhooks split into active/inactive, enriched with delivery count + last fired.
 *  Counts are keyed by the (event name + endpoint URL) combination, NOT by webhook
 *  id: re-pointing a webhook's URL therefore starts a fresh count for the new
 *  endpoint while the previous name+URL keeps its own count in the log history. */
export async function getWebhooks(owner: string | null): Promise<{
  active: WebhookRow[];
  inactive: WebhookRow[];
}> {
  // Matched by OWNER, in both spellings - the platform's webhooks exist under the
  // Platform tenant and, for anything created before the re-home, under null. Pinning
  // one spelling is what made a just-created webhook invisible on this very screen.
  const where = ownedWhere(owner);
  const [webhooks, counts] = await Promise.all([
    prisma.webhook.findMany({ where, orderBy: { name: "asc" } }),
    prisma.webhookLog.groupBy({
      by: ["eventName", "endpoint"],
      where,
      _count: { _all: true },
      _max: { createdAt: true },
    }),
  ]);
  // Key each count by "name|url" so it maps to the webhook's CURRENT endpoint only.
  const byCombo = new Map(counts.map((c) => [`${c.eventName}|${c.endpoint}`, c]));
  const rows: WebhookRow[] = webhooks.map((w) => {
    const c = byCombo.get(`${w.name}|${w.url}`);
    return {
      id: w.id,
      eventType: w.eventType,
      eventLabel: EVENT_LABEL[w.eventType] ?? w.eventType,
      name: w.name,
      url: w.url,
      status: w.status,
      logCount: c?._count._all ?? 0,
      lastFired: c?._max.createdAt ? c._max.createdAt.toISOString() : null,
      locked: w.firstDeliveredAt !== null,
    };
  });
  return {
    active: rows.filter((r) => r.status === "ACTIVE"),
    inactive: rows.filter((r) => r.status === "INACTIVE"),
  };
}

/**
 * Unified Webhook Logs: every event firing (EventLog), enriched with its latest
 * webhook delivery (WebhookLog) by submission + event name. Retry is offered
 * when an ACTIVE webhook exists and the event was not successfully delivered.
 */
export async function listEventActivity(opts: {
  page: number;
  pageSize: number;
  /** Scope to a tenant's events (null = platform/Gita). */
  tenantId: string | null;
}): Promise<{ rows: EventActivityRow[]; total: number }> {
  // Both spellings of the owner, like the webhook list above: the platform's own event
  // rows carry the Platform tenant id since the re-home and null before it, so pinning
  // one hides half the history from the only person who can act on it.
  const scopeWhere = ownedWhere(opts.tenantId);
  const [events, total, allWebhooks] = await Promise.all([
    prisma.eventLog.findMany({
      where: scopeWhere,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: {
        id: true,
        type: true,
        name: true,
        createdAt: true,
        submissionId: true,
        leadEmail: true,
        payload: true,
      },
    }),
    prisma.eventLog.count({ where: scopeWhere }),
    prisma.webhook.findMany({ where: ownedWhere(opts.tenantId), select: { id: true, name: true, eventType: true, status: true } }),
  ]);
  // Names/types are decoupled, so join EventLog <-> WebhookLog by event TYPE, not
  // name. Resolve each delivery's type via its webhook (by id, name fallback).
  const webhookTypeById = new Map(allWebhooks.map((w) => [w.id, w.eventType as string]));
  const webhookTypeByName = new Map(allWebhooks.map((w) => [w.name, w.eventType as string]));
  const activeTypes = new Set(allWebhooks.filter((w) => w.status === "ACTIVE").map((w) => w.eventType as string));

  const subIds = events
    .map((e) => e.submissionId)
    .filter((s): s is string => Boolean(s));
  const deliveries = subIds.length
    ? await prisma.webhookLog.findMany({
        where: { submissionId: { in: subIds }, ...ownedWhere(opts.tenantId) },
        orderBy: { createdAt: "desc" },
        select: {
          eventName: true,
          webhookId: true,
          submissionId: true,
          endpoint: true,
          success: true,
          responseStatus: true,
          attemptCount: true,
          responseBody: true,
          error: true,
        },
      })
    : [];
  // Latest delivery per submission+eventType (deliveries are ordered desc).
  const delMap = new Map<string, (typeof deliveries)[number]>();
  for (const d of deliveries) {
    const t =
      (d.webhookId ? webhookTypeById.get(d.webhookId) : undefined) ??
      webhookTypeByName.get(d.eventName);
    if (!t) continue; // crm: sends and orphaned logs are not event deliveries
    const key = `${d.submissionId}|${t}`;
    // One row per event in this view. With >1 webhook per trigger (multi-CRM),
    // keep the latest, but let a FAILED delivery win so a failure is never masked.
    const existing = delMap.get(key);
    if (!existing || (existing.success && !d.success)) delMap.set(key, d);
  }

  const rows: EventActivityRow[] = events.map((e) => {
    const d = e.submissionId ? delMap.get(`${e.submissionId}|${e.type}`) : undefined;
    const deliveryStatus = d ? (d.success ? "delivered" : "failed") : "none";
    return {
      id: e.id,
      eventName: e.name,
      createdAt: e.createdAt.toISOString(),
      submissionId: e.submissionId,
      leadEmail: e.leadEmail,
      payload: JSON.stringify(e.payload, null, 2),
      endpoint: d?.endpoint ?? null,
      deliveryStatus,
      responseStatus: d?.responseStatus ?? null,
      attemptCount: d?.attemptCount ?? 0,
      responseBody: d?.responseBody ?? null,
      error: d?.error ?? null,
      canRetry: activeTypes.has(e.type) && deliveryStatus !== "delivered",
    };
  });

  return { rows, total };
}

/**
 * CRM send log: WebhookLog rows written by the SCORE/CUSTOM senders (eventName
 * prefixed "crm:"). Mapped onto EventActivityRow so the same expandable table
 * renders them - Name (the sender's editable name), Webhook, full Payload, status.
 * Not retryable from here (re-send via the CRM panel's Retry/Start).
 */
export async function listCrmSendLogs(opts: {
  page: number;
  pageSize: number;
}): Promise<{ rows: EventActivityRow[]; total: number }> {
  const where = { eventName: { startsWith: "crm:" } };
  const [logs, total] = await Promise.all([
    prisma.webhookLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: {
        id: true,
        eventName: true,
        endpoint: true,
        payload: true,
        responseStatus: true,
        responseBody: true,
        error: true,
        attemptCount: true,
        success: true,
        createdAt: true,
        submissionId: true,
      },
    }),
    prisma.webhookLog.count({ where }),
  ]);

  const rows: EventActivityRow[] = logs.map((l) => {
    const payload = (l.payload ?? {}) as Record<string, unknown>;
    const email = typeof payload["contact_email"] === "string" ? (payload["contact_email"] as string) : null;
    return {
      id: l.id,
      eventName: l.eventName.replace(/^crm:/, ""), // display the sender's name
      createdAt: l.createdAt.toISOString(),
      submissionId: l.submissionId,
      leadEmail: email,
      payload: JSON.stringify(l.payload, null, 2),
      endpoint: l.endpoint,
      deliveryStatus: l.success ? "delivered" : "failed",
      responseStatus: l.responseStatus,
      attemptCount: l.attemptCount,
      responseBody: l.responseBody,
      error: l.error,
      canRetry: false,
    };
  });
  return { rows, total };
}

export async function getAppSetting() {
  return prisma.appSetting.findUnique({ where: { id: "singleton" } });
}

export interface RecentPurchase {
  submissionId: string;
  paymentId: string;
  amountRupees: number | null;
  email: string | null;
  createdAt: string;
  recordedVia: string | null; // the razorpay event that recorded it
  metaConversionAt: string | null; // when Meta got the conversion (null = never)
}

/** Recent captured assessment-unlock payments, for the "re-send conversion to
 *  Meta" recovery tool (e.g. sales whose buyer never returned so CAPI never fired). */
export async function listRecentPurchases(tenantId: string | null, take = 25): Promise<RecentPurchase[]> {
  const payments = await prisma.payment.findMany({
    where: {
      purpose: "assessment_unlock",
      status: { in: ["captured", "paid"] },
      providerPaymentId: { not: null },
      submissionId: { not: null },
      tenantId,
    },
    orderBy: { createdAt: "desc" },
    take,
    select: { providerPaymentId: true, amount: true, createdAt: true, submissionId: true, event: true, metaConversionAt: true },
  });
  const subIds = payments.map((p) => p.submissionId).filter((s): s is string => Boolean(s));
  const subs = subIds.length
    ? await prisma.submission.findMany({ where: { id: { in: subIds } }, select: { id: true, leadEmail: true } })
    : [];
  const emailById = new Map(subs.map((s) => [s.id, s.leadEmail]));
  return payments.map((p) => ({
    submissionId: p.submissionId as string,
    paymentId: p.providerPaymentId as string,
    amountRupees: p.amount != null ? p.amount / 100 : null,
    email: emailById.get(p.submissionId as string) ?? null,
    createdAt: p.createdAt.toISOString(),
    recordedVia: p.event ?? null,
    metaConversionAt: p.metaConversionAt ? p.metaConversionAt.toISOString() : null,
  }));
}

export interface CapiLogRow {
  id: string;
  providerPaymentId: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
  amountRupees: number | null;
  currency: string;
  eventName: string;
  matched: boolean;
  autoFired: boolean;
  status: string; // pending | sent | failed
  httpStatus: number | null;
  response: string | null;
  firedAt: string | null;
  createdAt: string;
}

export interface CapiLogQuery {
  /** Page size. */
  take?: number;
  /** Rows to skip - page offset. Pairs with `take` and the matching countCapiLogs(). */
  skip?: number;
  /**
   * Which funnel. Defaults to the assessment (respondent) funnel so the existing
   * Conversions views keep showing what they always showed; the Assess360 SaaS funnel's
   * own signups and subscriptions live under "platform" and are read explicitly. Without
   * the split both would appear here as bare "CompleteRegistration" rows with nothing to
   * tell them apart.
   */
  scope?: "assessment" | "platform";
  /**
   * "payments" restricts to rows that carry money. The log holds every CAPI event the
   * funnel fires - opt-in (CompleteRegistration), completion, and Purchase - so a view
   * that means "payments" has to say so.
   *
   * The test is `amountPaise != null`, NOT `eventName = "Purchase"`: a high-ticket
   * payment is fired under the configurable `purchaseHighTicketEventName`, so filtering
   * by name would silently drop exactly the largest payments. Omitted = every event,
   * which is what the debugging views want.
   */
  only?: "payments";
}

/** The one place the Conversions filter is expressed, so a list and its count cannot
 *  drift apart - a paginated view whose total counts different rows than the page
 *  shows is worse than no count at all. */
function capiLogWhere(tenantId: string | null, q: CapiLogQuery) {
  return {
    tenantId,
    scope: q.scope ?? ("assessment" as const),
    ...(q.only === "payments" ? { amountPaise: { not: null } } : {}),
  };
}

/** How many rows a given query matches - the total behind the pager. */
export async function countCapiLogs(tenantId: string | null, q: CapiLogQuery = {}): Promise<number> {
  return prisma.capiLog.count({ where: capiLogWhere(tenantId, q) });
}

/** CAPI log rows for one funnel, newest first. */
export async function listCapiLogs(
  tenantId: string | null,
  q: CapiLogQuery = {},
): Promise<CapiLogRow[]> {
  const rows = await prisma.capiLog.findMany({
    where: capiLogWhere(tenantId, q),
    orderBy: { createdAt: "desc" },
    take: q.take ?? 100,
    skip: q.skip ?? 0,
  });
  return rows.map((r) => ({
    id: r.id,
    providerPaymentId: r.providerPaymentId,
    email: r.email,
    phone: r.phone,
    name: r.name,
    amountRupees: r.amountPaise != null ? r.amountPaise / 100 : null,
    currency: r.currency,
    eventName: r.eventName,
    matched: r.matched,
    autoFired: r.autoFired,
    status: r.status,
    httpStatus: r.httpStatus,
    response: r.response,
    firedAt: r.firedAt ? r.firedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}
