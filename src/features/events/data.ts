import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { WebhookRow, EventActivityRow } from "@/features/events/types";

/** Webhooks split into active/inactive, enriched with event log count + last fired. */
export async function getWebhooks(): Promise<{
  active: WebhookRow[];
  inactive: WebhookRow[];
}> {
  const [webhooks, counts] = await Promise.all([
    prisma.webhook.findMany({ orderBy: { name: "asc" } }),
    prisma.eventLog.groupBy({
      by: ["name"],
      _count: { _all: true },
      _max: { createdAt: true },
    }),
  ]);
  const byName = new Map(counts.map((c) => [c.name, c]));
  const rows: WebhookRow[] = webhooks.map((w) => {
    const c = byName.get(w.name);
    return {
      id: w.id,
      name: w.name,
      url: w.url,
      status: w.status,
      logCount: c?._count._all ?? 0,
      lastFired: c?._max.createdAt ? c._max.createdAt.toISOString() : null,
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
  const [events, total, activeWebhooks] = await Promise.all([
    prisma.eventLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: {
        id: true,
        name: true,
        createdAt: true,
        submissionId: true,
        leadEmail: true,
        payload: true,
      },
    }),
    prisma.eventLog.count(),
    prisma.webhook.findMany({ where: { status: "ACTIVE" }, select: { name: true } }),
  ]);
  const activeNames = new Set(activeWebhooks.map((w) => w.name));

  const subIds = events
    .map((e) => e.submissionId)
    .filter((s): s is string => Boolean(s));
  const deliveries = subIds.length
    ? await prisma.webhookLog.findMany({
        where: { submissionId: { in: subIds } },
        orderBy: { createdAt: "desc" },
        select: {
          eventName: true,
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
  // Latest delivery per submission+event (deliveries are ordered desc).
  const delMap = new Map<string, (typeof deliveries)[number]>();
  for (const d of deliveries) {
    const key = `${d.submissionId}|${d.eventName}`;
    if (!delMap.has(key)) delMap.set(key, d);
  }

  const rows: EventActivityRow[] = events.map((e) => {
    const d = e.submissionId ? delMap.get(`${e.submissionId}|${e.name}`) : undefined;
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
      canRetry: activeNames.has(e.name) && deliveryStatus !== "delivered",
    };
  });

  return { rows, total };
}

export async function getAppSetting() {
  return prisma.appSetting.findUnique({ where: { id: "singleton" } });
}
