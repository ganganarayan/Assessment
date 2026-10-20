import "server-only";
import { prisma } from "@/lib/db/prisma";
import { formatIST } from "@/lib/date";
import {
  type AutomationRow,
  type AutomationRunRow,
  type AutomationChannelValue,
  type AutomationRunStatusValue,
  type AutomationTriggerValue,
} from "@/features/automation/types";

/**
 * Reads for the automation screen: the rules, and what they have actually done.
 *
 * The counts are not decoration. A rule that has sent nothing in a fortnight is either
 * waiting for its first booking or quietly broken, and the only way to tell them apart
 * is to show the number beside the rule rather than in a log nobody opens.
 */

const toVars = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((v) => (typeof v === "string" ? v : "")) : [];

export async function listAutomations(tenantId: string): Promise<AutomationRow[]> {
  const [rows, counts, recent] = await Promise.all([
    prisma.automation.findMany({
      where: { tenantId },
      orderBy: [{ active: "desc" }, { createdAt: "asc" }],
      include: {
        actions: { orderBy: { displayOrder: "asc" } },
        bookingType: { select: { name: true } },
      },
    }),
    prisma.automationRun.groupBy({
      by: ["automationId", "status"],
      where: { tenantId },
      _count: { _all: true },
    }),
    // What each MESSAGE has done inside the retained window. One grouped query for the
    // whole workspace rather than one per message: a workspace with six automations and
    // three messages each would otherwise be eighteen queries to draw one page.
    prisma.automationSend.groupBy({
      by: ["actionId", "status"],
      where: { tenantId },
      _count: { _all: true },
    }),
  ]);

  const recentByAction = new Map<string, { sent: number; failed: number }>();
  for (const r of recent) {
    const t = recentByAction.get(r.actionId) ?? { sent: 0, failed: 0 };
    if (r.status === "SENT") t.sent += r._count._all;
    else if (r.status === "FAILED") t.failed += r._count._all;
    recentByAction.set(r.actionId, t);
  }

  const tally = new Map<string, { sent: number; pending: number; failed: number }>();
  for (const c of counts) {
    const t = tally.get(c.automationId) ?? { sent: 0, pending: 0, failed: 0 };
    if (c.status === "SENT") t.sent += c._count._all;
    else if (c.status === "PENDING" || c.status === "SENDING") t.pending += c._count._all;
    else if (c.status === "FAILED") t.failed += c._count._all;
    tally.set(c.automationId, t);
  }

  return rows.map((a) => {
    const t = tally.get(a.id) ?? { sent: 0, pending: 0, failed: 0 };
    return {
      id: a.id,
      name: a.name,
      trigger: a.trigger as AutomationTriggerValue,
      bookingTypeId: a.bookingTypeId,
      bookingTypeName: a.bookingType?.name ?? null,
      offsetMin: a.offsetMin,
      active: a.active,
      actions: a.actions.map((x) => {
        const r = recentByAction.get(x.id) ?? { sent: 0, failed: 0 };
        return {
          id: x.id,
          channel: x.channel as AutomationChannelValue,
          subject: x.subject ?? "",
          body: x.body ?? "",
          wabaTemplate: x.wabaTemplate ?? "",
          wabaLang: x.wabaLang,
          wabaVars: toVars(x.wabaVars),
          zoomTopic: x.zoomTopic ?? "",
          stats: {
            sent: x.sentCount,
            failed: x.failedCount,
            skipped: x.skippedCount,
            clicks: x.clickCount,
            recentSent: r.sent,
            recentFailed: r.failed,
          },
        };
      }),
      sentCount: t.sent,
      pendingCount: t.pending,
      failedCount: t.failed,
    };
  });
}

/** The last runs, newest first: what went out, what is waiting, what broke and why. */
export async function listAutomationRuns(tenantId: string, take = 50): Promise<AutomationRunRow[]> {
  const runs = await prisma.automationRun.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      dueAt: true,
      status: true,
      attempts: true,
      lastError: true,
      skipReason: true,
      automation: { select: { name: true, trigger: true } },
      appointment: {
        select: {
          startAt: true,
          attendeeName: true,
          attendeeEmail: true,
          bookingType: { select: { name: true } },
        },
      },
    },
  });

  return runs.map((r) => ({
    id: r.id,
    automationName: r.automation.name,
    trigger: r.automation.trigger as AutomationTriggerValue,
    dueLabel: formatIST(r.dueAt),
    status: r.status as AutomationRunStatusValue,
    attempts: r.attempts,
    lastError: r.lastError,
    skipReason: r.skipReason,
    who: r.appointment.attendeeName ?? r.appointment.attendeeEmail ?? "Someone",
    appointmentLabel: `${r.appointment.bookingType?.name ?? "Appointment"} · ${formatIST(r.appointment.startAt)}`,
  }));
}

/** The workspace's booking links, for the "which one does this watch" picker. */
export async function automationBookingTypes(tenantId: string) {
  const rows = await prisma.bookingType.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  return rows.map((r) => ({ id: r.id, label: r.name }));
}
