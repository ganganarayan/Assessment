// Deliberately NOT `server-only`: mirrors capi-log.ts, which the Railway cron
// (tsx scripts/sweep-abandoned.ts) reaches from outside Next, where the
// `server-only` package does not resolve at all. The prisma import already makes
// client bundling impossible.
import { prisma } from "@/lib/db/prisma";
import { istDayStart } from "@/lib/date";

/**
 * Count ONE Meta event firing - a running total, not a row per event.
 *
 * GateDisqualified has no lead, no submission and (now) no browser pixel behind it,
 * so without this the app cannot answer "is my exclusion audience actually being
 * built?". A log row per firing would duplicate GateDisqualification (which counts
 * PEOPLE) and grow without bound on a funnel whose whole job is turning people away,
 * so this increments one row per assessment per event per IST day instead.
 *
 * Counts EVENTS, not people: a renewal firing for a visitor already in the audience
 * increments it again - that is what makes it comparable with Meta's own number.
 *
 * Fully fail-soft: analytics must never break a respondent-facing path.
 */
export async function bumpFunnelEventCount(args: {
  assessmentId: string;
  tenantId: string | null;
  eventName: string;
  /** false = the send failed (network error / Meta rejected it) - counted apart. */
  ok: boolean;
  at?: Date;
}): Promise<void> {
  try {
    const day = istDayStart(args.at ?? new Date());
    const delta = args.ok ? { count: { increment: 1 } } : { failed: { increment: 1 } };
    await prisma.funnelEventCount.upsert({
      where: { assessmentId_eventName_day: { assessmentId: args.assessmentId, eventName: args.eventName, day } },
      update: delta,
      create: {
        assessmentId: args.assessmentId,
        tenantId: args.tenantId,
        eventName: args.eventName,
        day,
        count: args.ok ? 1 : 0,
        failed: args.ok ? 0 : 1,
      },
    });
  } catch {
    // a counter is never a reason to fail the caller
  }
}

/**
 * Undo counted firings for submissions that are being DELETED.
 *
 * The tally is keyed by (assessment, event, IST day) and holds no submission id, so
 * nothing linked it to the rows it came from: deleting a submission left its events
 * counted for ever. Two deleted test submissions are exactly why this funnel read
 * "QualifiedCompletion 7" against five real leads, and the owner had no way to
 * reconcile the two numbers.
 *
 * The CAPI log is the record of what was actually sent, so it is what we count back
 * out: one decrement per logged send, bucketed by the day that send happened (not
 * today), so an old deletion lands on the day it inflated. `sent` rows come off
 * `count` and `failed` rows off `failed`, mirroring how they went on.
 *
 * The log rows themselves are left alone. They are the audit trail of what Meta was
 * told, and that remains true after the lead is gone.
 *
 * Clamped at zero: a tally that has already been reset must never go negative, and a
 * log row whose counter was never bumped (an event counted before this existed) would
 * otherwise push it below zero.
 *
 * Fail-soft like the rest of this file - a deletion must never fail over a counter.
 */
export async function uncountSubmissionFirings(
  submissions: ReadonlyArray<{ id: string; assessmentId: string }>,
): Promise<void> {
  try {
    if (submissions.length === 0) return;
    const assessmentBySubmission = new Map(submissions.map((s) => [s.id, s.assessmentId]));

    const logs = await prisma.capiLog.findMany({
      where: { submissionId: { in: submissions.map((s) => s.id) }, status: { in: ["sent", "failed"] } },
      select: { submissionId: true, eventName: true, status: true, createdAt: true },
    });

    // Collapse to one update per (assessment, event, day) so a lead with several
    // events, or a bulk delete, is a handful of writes rather than one per row.
    const buckets = new Map<string, { assessmentId: string; eventName: string; day: Date; sent: number; failed: number }>();
    for (const log of logs) {
      const assessmentId = log.submissionId ? assessmentBySubmission.get(log.submissionId) : undefined;
      if (!assessmentId) continue;
      const day = istDayStart(log.createdAt);
      const key = `${assessmentId}|${log.eventName}|${day.toISOString()}`;
      const bucket = buckets.get(key) ?? { assessmentId, eventName: log.eventName, day, sent: 0, failed: 0 };
      if (log.status === "sent") bucket.sent += 1;
      else bucket.failed += 1;
      buckets.set(key, bucket);
    }

    for (const b of buckets.values()) {
      const row = await prisma.funnelEventCount.findUnique({
        where: { assessmentId_eventName_day: { assessmentId: b.assessmentId, eventName: b.eventName, day: b.day } },
        select: { id: true, count: true, failed: true },
      });
      if (!row) continue;
      await prisma.funnelEventCount.update({
        where: { id: row.id },
        data: {
          count: Math.max(0, row.count - b.sent),
          failed: Math.max(0, row.failed - b.failed),
        },
      });
    }
  } catch {
    // a counter is never a reason to fail a deletion
  }
}
