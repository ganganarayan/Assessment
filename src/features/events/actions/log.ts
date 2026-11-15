"use server";

import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, tenantScope } from "@/lib/tenant/acting";
import { formatIST } from "@/lib/date";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * The per-run event log, read back: what one visitor's run through a funnel sent to
 * Meta, from both sides. Rows come from RunEvent (browser pixel beacons and server
 * Conversions API sends), grouped by the first-party visitor id, with the path the
 * visitor took read from the gate entry and submission rows of the same id.
 */

interface RunEventView {
  time: string;
  side: "browser" | "server";
  event: string;
  status: string;
  event_id: string | null;
  meta_http: number | null;
  meta_reply: string | null;
  dedup: string;
}

interface RunView {
  visitor_id: string;
  test_run: boolean;
  first_seen: string;
  path: string[];
  events: RunEventView[];
}

const MAX_MINUTES = 7 * 24 * 60;

/** Read what fired, per visitor run, on one assessment in the last sinceMinutes (default 60, at most 7 days). Each run lists the path taken (gate passed, opt-in reached, opted in, completed) and every Meta event from the browser pixel and the server, with its event id, whether both sides share it (Meta dedupes them), Meta's reply and the test flag. Pixel status: fired, would_fire (test run, pixel not loaded), not_loaded. Server status: sent, failed, test_sent (Test events tab, via the ad account's test event code), test_failed, would_fire (test run with no test event code saved), skipped. includeTestRuns false shows real visitors only. */
export async function listRunEvents(
  assessmentId: string,
  sinceMinutes = 60,
  includeTestRuns = true,
): Promise<ActionResult<{ assessment: string; since: string; runs: RunView[]; note: string }>> {
  const scope = await resolveActingScope();
  const a = await prisma.assessment.findFirst({ where: { id: assessmentId, ...tenantScope(scope) }, select: { id: true, title: true } });
  if (!a) return { ok: false, error: "Not found." };

  const minutes = Math.min(Math.max(1, Math.floor(Number(sinceMinutes) || 60)), MAX_MINUTES);
  const since = new Date(Date.now() - minutes * 60_000);
  const rows = await prisma.runEvent.findMany({
    where: { assessmentId: a.id, createdAt: { gte: since }, ...(includeTestRuns ? {} : { isPreview: false }) },
    orderBy: { createdAt: "asc" },
    take: 2000,
  });

  const visitorIds = [...new Set(rows.map((r) => r.visitorId))];
  const [entries, submissions] = visitorIds.length
    ? await Promise.all([
        prisma.gateEntry.findMany({
          where: { assessmentId: a.id, visitorId: { in: visitorIds } },
          select: { visitorId: true, passedAt: true, optinSeenAt: true, emailCapturedAt: true, abandonedFiredAt: true },
        }),
        prisma.submission.findMany({
          where: { assessmentId: a.id, metaExternalId: { in: visitorIds }, createdAt: { gte: new Date(since.getTime() - 86_400_000) } },
          select: { metaExternalId: true, status: true, createdAt: true, completedAt: true },
          orderBy: { createdAt: "desc" },
        }),
      ])
    : [[], []];

  // Which event ids each side reported, so every row can say whether Meta will merge it.
  const key = (name: string, id: string | null) => `${name}|${id ?? ""}`;
  const pixelIds = new Set(rows.filter((r) => r.source === "pixel" && r.eventId).map((r) => key(r.eventName, r.eventId)));
  const capiIds = new Set(rows.filter((r) => r.source === "capi").map((r) => key(r.eventName, r.eventId)));

  const runs: RunView[] = visitorIds.map((vid) => {
    const mine = rows.filter((r) => r.visitorId === vid);
    const entry = entries.find((e) => e.visitorId === vid);
    const sub = submissions.find((s) => s.metaExternalId === vid);
    const path: string[] = [];
    if (entry) {
      path.push(`passed the gate ${formatIST(entry.passedAt)}`);
      if (entry.optinSeenAt) path.push(`reached the opt-in ${formatIST(entry.optinSeenAt)}`);
      if (entry.emailCapturedAt) path.push(`gave an email ${formatIST(entry.emailCapturedAt)}`);
      if (entry.abandonedFiredAt) path.push(`marked abandoned ${formatIST(entry.abandonedFiredAt)}`);
    }
    if (sub) {
      path.push(`opted in ${formatIST(sub.createdAt)}`);
      if (sub.completedAt) path.push(`completed ${formatIST(sub.completedAt)}`);
    }
    if (path.length === 0) path.push("no gate pass or opt-in recorded (turned away at the gate, or left before it)");

    return {
      visitor_id: vid,
      test_run: mine.some((r) => r.isPreview),
      first_seen: formatIST(mine[0]!.createdAt),
      path,
      events: mine.map((r) => {
        const k = key(r.eventName, r.eventId);
        const dedup =
          r.source === "pixel"
            ? !r.eventId
              ? "browser only, no event id"
              : capiIds.has(k)
                ? "server sent the same event id: Meta counts it once"
                : "browser only"
            : pixelIds.has(k)
              ? "browser reported the same event id: Meta counts it once"
              : "server only";
        return {
          time: formatIST(r.createdAt, true),
          side: r.source === "pixel" ? "browser" : "server",
          event: r.eventName,
          status: r.status,
          event_id: r.eventId,
          meta_http: r.httpStatus,
          meta_reply: r.response ? r.response.slice(0, 300) : null,
          dedup,
        };
      }),
    };
  });

  return {
    ok: true,
    data: {
      assessment: a.title,
      since: formatIST(since),
      runs,
      note:
        "Times are IST. A test run never reaches production Meta: its server events go to Events Manager, Test events, only when the ad account has a test event code saved (status test_sent), otherwise they are logged as would_fire. Runs are grouped by the browser's first-party id, so a run in a private window or another browser shows as its own run.",
    },
  };
}
