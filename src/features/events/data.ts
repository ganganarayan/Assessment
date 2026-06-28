import "server-only";
import { prisma } from "@/lib/db/prisma";
import { EVENT_LABEL } from "@/features/events/types";
import type { WebhookRow, EventActivityRow } from "@/features/events/types";

/** Webhooks split into active/inactive, enriched with delivery count + last fired
 *  (counted PER WEBHOOK by webhookId, since names are now free/per-CRM). */
export async function getWebhooks(): Promise<{
  active: WebhookRow[];
  inactive: WebhookRow[];
}> {
  const [webhooks, counts] = await Promise.all([
    prisma.webhook.findMany({ orderBy: { name: "asc" } }),
    prisma.webhookLog.groupBy({
      by: ["webhookId"],
      _count: { _all: true },
      _max: { createdAt: true },
    }),
  ]);
  const byId = new Map(counts.map((c) => [c.webhookId, c]));
  const rows: WebhookRow[] = webhooks.map((w) => {
    const c = byId.get(w.id);
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
}): Promise<{ rows: EventActivityRow[]; total: number }> {
  const [events, total, allWebhooks] = await Promise.all([
    prisma.eventLog.findMany({
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
    prisma.eventLog.count(),
    prisma.webhook.findMany({ select: { id: true, name: true, eventType: true, status: true } }),
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
        where: { submissionId: { in: subIds } },
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
 * renders them — Name (the sender's editable name), Webhook, full Payload, status.
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
}

/** Recent captured assessment-unlock payments, for the "re-send conversion to
 *  Meta" recovery tool (e.g. sales whose buyer never returned so CAPI never fired). */
export async function listRecentPurchases(take = 25): Promise<RecentPurchase[]> {
  const payments = await prisma.payment.findMany({
    where: {
      purpose: "assessment_unlock",
      status: { in: ["captured", "paid"] },
      providerPaymentId: { not: null },
      submissionId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take,
    select: { providerPaymentId: true, amount: true, createdAt: true, submissionId: true },
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
  }));
}
