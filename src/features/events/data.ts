import "server-only";
import { EventType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { WebhookRow } from "@/features/events/types";

export async function listEventLogs(opts: {
  type?: EventType;
  page: number;
  pageSize: number;
}) {
  const where = opts.type ? { type: opts.type } : {};
  const [rows, total] = await Promise.all([
    prisma.eventLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: {
        id: true,
        name: true,
        type: true,
        createdAt: true,
        submissionId: true,
        leadEmail: true,
      },
    }),
    prisma.eventLog.count({ where }),
  ]);
  return { rows, total };
}

export async function eventCountsByType(): Promise<Map<EventType, number>> {
  const grouped = await prisma.eventLog.groupBy({
    by: ["type"],
    _count: { _all: true },
  });
  const map = new Map<EventType, number>();
  for (const g of grouped) map.set(g.type, g._count._all);
  return map;
}

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

export async function listWebhookLogs(opts: { page: number; pageSize: number }) {
  const [rows, total, activeWebhooks] = await Promise.all([
    prisma.webhookLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.webhookLog.count(),
    prisma.webhook.findMany({ where: { status: "ACTIVE" }, select: { name: true } }),
  ]);
  const activeNames = new Set(activeWebhooks.map((w) => w.name));
  return { rows, total, activeNames };
}

export async function getAppSetting() {
  return prisma.appSetting.findUnique({ where: { id: "singleton" } });
}
