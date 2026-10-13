/**
 * What the funnel WROTE, read back from staging.
 *
 * The browser can only show what a respondent sees, and half of what matters about a
 * funnel is invisible to them: whether a lead row exists, whether the gate recorded a
 * rejection, whether the completion was reported to Meta. All of that is rows, so it
 * is read as rows.
 *
 * Events are read as a DELTA around each case rather than an absolute count, because
 * FunnelEventCount is a running per-day total that other traffic also writes to. The
 * events are counted even when no pixel is configured (a failed send still increments
 * `failed`), which is exactly what makes this assertable on staging: the question is
 * what the funnel DECIDED to report, not what Meta received.
 */
import { db } from "../db.js";
import { normalizeIdentifier } from "../../../src/features/assessment/lockout.js";
import type { Funnel } from "../config/read.js";
import type { Identity } from "../drive/identity.js";

export type EventCounts = Map<string, number>;

/** count + failed per event name for today, which is what a case can move. */
export async function eventSnapshot(assessmentId: string): Promise<EventCounts> {
  const rows = await db().funnelEventCount.findMany({
    where: { assessmentId },
    select: { eventName: true, count: true, failed: true, day: true },
    orderBy: { day: "desc" },
    take: 200,
  });
  const out: EventCounts = new Map();
  for (const r of rows) {
    out.set(r.eventName, (out.get(r.eventName) ?? 0) + r.count + r.failed);
  }
  return out;
}

export function eventDelta(before: EventCounts, after: EventCounts): EventCounts {
  const out: EventCounts = new Map();
  for (const [name, n] of after) {
    const diff = n - (before.get(name) ?? 0);
    if (diff !== 0) out.set(name, diff);
  }
  return out;
}

export interface RowObservation {
  submissionId: string | null;
  /** How many submissions this identity has on this funnel. The retake lockout is the
   *  reason it matters: a blocked second attempt must not leave a second row. */
  submissionCount: number;
  status: "STARTED" | "COMPLETED" | null;
  hasLead: boolean;
  leadEmail: string | null;
  gateScore: number | null;
  gateMax: number | null;
  gateBand: string | null;
  gateExitKey: string | null;
  totalScore: number | null;
  maxScore: number | null;
  bandTitle: string | null;
  /** GateEntry for this visitor: they passed the gate. */
  gateEntry: boolean;
  optinSeenAt: Date | null;
  /** Set when the visitor was SEEN leaving the opt-in: the verdict is due ten minutes
   *  later. Null means no departure was seen, and the 24-hour fallback applies. */
  abandonDueAt: Date | null;
  /** Set once the verdict has been decided, so it can never fire twice. */
  abandonedFiredAt: Date | null;
  /** GateDisqualification rows for this visitor. */
  disqualifications: number;
  /** Anything outbound that should NOT have happened on a QA run. */
  crmJobs: number;
  nurtureLogs: number;
  webhookDeliveries: number;
}

export async function readRows(
  funnel: Funnel,
  identity: Identity,
  /** The server cookie: how a REJECTION is keyed. */
  visitorId: string | null,
  /** The browser id: how a PASS is keyed. Two tables, two ids. */
  externalId: string | null,
): Promise<RowObservation> {
  const assessmentId = funnel.row.id;
  const identifierValue = normalizeIdentifier(funnel.row.uniqueIdentifier, {
    email: identity.email,
    mobile: identity.mobile,
  });

  // The row is found by the identity the harness used, not by "the newest row": a
  // sweep runs several cases a minute and the newest row is somebody else's case.
  const submission = identifierValue
    ? await db().submission.findFirst({
        where: { assessmentId, identifierValue },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          leadEmail: true,
          leadFirstName: true,
          leadMobile: true,
          gateScore: true,
          gateMax: true,
          gateBand: true,
          gateExitKey: true,
          totalScore: true,
          maxScore: true,
          resultBand: { select: { title: true } },
        },
      })
    : null;

  const submissionCount = identifierValue
    ? await db().submission.count({ where: { assessmentId, identifierValue } })
    : 0;

  const gateEntry = externalId
    ? await db().gateEntry.findFirst({
        where: { assessmentId, visitorId: externalId },
        select: { id: true, optinSeenAt: true, abandonDueAt: true, abandonedFiredAt: true },
      })
    : null;

  const disqualifications = visitorId
    ? await db().gateDisqualification.count({ where: { assessmentId, visitorId } })
    : 0;

  const crmJobs = submission ? await db().crmSendQueue.count({ where: { submissionId: submission.id } }) : 0;
  const nurtureLogs = submission ? await db().nurtureLog.count({ where: { submissionId: submission.id } }) : 0;
  const webhookDeliveries = submission
    ? await db().webhookDelivery.count({ where: { submissionId: submission.id } })
    : 0;

  return {
    submissionId: submission?.id ?? null,
    submissionCount,
    status: submission?.status ?? null,
    hasLead: Boolean(submission && (submission.leadEmail || submission.leadMobile || submission.leadFirstName)),
    leadEmail: submission?.leadEmail ?? null,
    gateScore: submission?.gateScore ?? null,
    gateMax: submission?.gateMax ?? null,
    gateBand: submission?.gateBand ?? null,
    gateExitKey: submission?.gateExitKey ?? null,
    totalScore: submission?.totalScore ?? null,
    maxScore: submission?.maxScore ?? null,
    bandTitle: submission?.resultBand?.title ?? null,
    gateEntry: Boolean(gateEntry),
    optinSeenAt: gateEntry?.optinSeenAt ?? null,
    abandonDueAt: gateEntry?.abandonDueAt ?? null,
    abandonedFiredAt: gateEntry?.abandonedFiredAt ?? null,
    disqualifications,
    crmJobs,
    nurtureLogs,
    webhookDeliveries,
  };
}
