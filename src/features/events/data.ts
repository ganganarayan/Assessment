import "server-only";
import { EventType, type WebhookEndpoint } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { RegistryRow } from "@/features/events/types";

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

export async function getWebhookEndpointsByEvent(): Promise<
  Map<EventType, WebhookEndpoint>
> {
  const rows = await prisma.webhookEndpoint.findMany();
  const map = new Map<EventType, WebhookEndpoint>();
  for (const r of rows) map.set(r.event, r);
  return map;
}

export async function listWebhookLogs(opts: { page: number; pageSize: number }) {
  const [rows, total] = await Promise.all([
    prisma.webhookLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.webhookLog.count(),
  ]);
  return { rows, total };
}

export async function getAppSetting() {
  return prisma.appSetting.findUnique({ where: { id: "singleton" } });
}

/** Event registry grouped by lifecycle stage, enriched with count + last-fired. */
export async function getEventRegistry(): Promise<{
  active: RegistryRow[];
  deactivated: RegistryRow[];
  purged: RegistryRow[];
}> {
  const [events, counts] = await Promise.all([
    prisma.event.findMany({ orderBy: { name: "asc" } }),
    prisma.eventLog.groupBy({
      by: ["name"],
      _count: { _all: true },
      _max: { createdAt: true },
    }),
  ]);
  const byName = new Map(counts.map((c) => [c.name, c]));

  const rows: RegistryRow[] = events.map((e) => {
    const c = byName.get(e.name);
    return {
      id: e.id,
      name: e.name,
      status: e.status,
      builtIn: e.builtIn,
      count: c?._count._all ?? 0,
      lastFired: c?._max.createdAt ? c._max.createdAt.toISOString() : null,
    };
  });

  return {
    active: rows.filter((r) => r.status === "ACTIVE"),
    deactivated: rows.filter((r) => r.status === "DEACTIVATED"),
    purged: rows.filter((r) => r.status === "PURGED"),
  };
}
