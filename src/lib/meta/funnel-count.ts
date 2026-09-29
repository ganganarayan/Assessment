// Deliberately NOT `server-only`: mirrors capi-log.ts, which the Railway cron
// (tsx scripts/sweep-abandoned.ts) reaches from outside Next, where the
// `server-only` package does not resolve at all. The prisma import already makes
// client bundling impossible.
import { prisma } from "@/lib/db/prisma";
import { istDayStart } from "@/lib/date";

/**
 * Count ONE Meta event firing — a running total, not a row per event.
 *
 * GateDisqualified has no lead, no submission and (now) no browser pixel behind it,
 * so without this the app cannot answer "is my exclusion audience actually being
 * built?". A log row per firing would duplicate GateDisqualification (which counts
 * PEOPLE) and grow without bound on a funnel whose whole job is turning people away,
 * so this increments one row per assessment per event per IST day instead.
 *
 * Counts EVENTS, not people: a renewal firing for a visitor already in the audience
 * increments it again — that is what makes it comparable with Meta's own number.
 *
 * Fully fail-soft: analytics must never break a respondent-facing path.
 */
export async function bumpFunnelEventCount(args: {
  assessmentId: string;
  tenantId: string | null;
  eventName: string;
  /** false = the send failed (network error / Meta rejected it) — counted apart. */
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
