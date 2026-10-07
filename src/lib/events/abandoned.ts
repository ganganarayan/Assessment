import { EventType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { emitEvent } from "@/lib/events/emit";
import { normalizeAttribution } from "@/lib/events/payload";
import { sendAndLogLifecycleCapi } from "@/lib/meta/capi-log";
import { metaEventOn } from "@/features/assessment/meta-events";
import { bumpFunnelEventCount } from "@/lib/meta/funnel-count";
import { ABANDONED_EVENT } from "@/features/assessment/schemas";
import { type EmitInput } from "@/features/events/types";

const DEFAULT_HOURS = 24;
const BATCH = 500;

/**
 * Find submissions that were STARTED (lead.created) but never COMPLETED after
 * the configured delay, mark them abandoned (once), and emit assessment.abandoned.
 *
 * Idempotent + concurrency-safe: the STARTED->abandoned flip is a compare-and-
 * swap (updateMany guarded on status+abandonedAt), so an event fires at most
 * once per submission even if the sweep overlaps with itself or a completion.
 */
export async function sweepAbandoned(): Promise<{ swept: number; scanned: number }> {
  const setting = await prisma.appSetting.findUnique({ where: { id: "singleton" } });
  const hours = setting?.abandonedAfterHours ?? DEFAULT_HOURS;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  const candidates = await prisma.submission.findMany({
    // completedAt: null excludes ever-completed submissions - a paid-mode respondent
    // who completed then returned to edit is reset to STARTED (keeping the old
    // startedAt), and must NOT be swept as abandoned / nurtured as a lost lead.
    where: { status: "STARTED", abandonedAt: null, completedAt: null, startedAt: { lt: cutoff } },
    select: {
      id: true,
      assessmentId: true,
      startedAt: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      attribution: true,
      assessment: {
        select: {
          id: true,
          slug: true,
          title: true,
          tenant: { select: { id: true, slug: true, name: true } },
        },
      },
    },
    take: BATCH,
  });

  let swept = 0;
  for (const s of candidates) {
    const claim = await prisma.submission.updateMany({
      where: { id: s.id, status: "STARTED", abandonedAt: null },
      data: { abandonedAt: new Date() },
    });
    if (claim.count === 0) continue; // someone else handled/completed it

    await emitEvent(EventType.ASSESSMENT_ABANDONED, {
      submissionId: s.id,
      tenant: s.assessment.tenant,
      assessment: { id: s.assessment.id, slug: s.assessment.slug, title: s.assessment.title },
      lead: {
        firstName: s.leadFirstName,
        lastName: s.leadLastName,
        email: s.leadEmail,
        mobile: s.leadMobile,
      },
      attribution: normalizeAttribution(s.attribution) ?? undefined,
    } satisfies EmitInput);
    swept++;
  }

  return { swept, scanned: candidates.length };
}

/**
 * Fire Meta `AssessmentAbandoned` for visitors who PASSED the page-1 gate and
 * then never completed - the retargeting pool.
 *
 * Why a sweep and not a pixel on the page: abandonment is only knowable AFTER
 * the fact. A closed tab runs no JavaScript, so the very people worth catching
 * are the ones a browser-side "I'm leaving" event would miss. So the gate pass
 * is recorded (GateEntry, with its Meta match signals) and the decision is made
 * here, once the delay has elapsed and we can compare against completions.
 *
 * "Completed" is resolved through the visitor's first-party id: GateEntry
 * .visitorId is the same value that lands on Submission.metaExternalId at the
 * opt-in, so no lead data is needed to tell the two apart.
 *
 * Idempotent + concurrency-safe in the same style as sweepAbandoned(): the
 * abandonedFiredAt stamp is claimed with a guarded updateMany before the event
 * is sent, so overlapping runs can't double-fire. The claim is taken BEFORE the
 * send deliberately - a duplicate Meta event is worse than a missed one here,
 * because the audience it feeds is already populated by the first.
 *
 * The send itself carries no PII: fbp/fbc/ip/ua/external_id only, which is all
 * a pre-opt-in visitor has. Match quality is lower than a completion event's,
 * which is expected for this kind of audience.
 */
export async function sweepGateAbandoned(): Promise<{ fired: number; scanned: number }> {
  const setting = await prisma.appSetting.findUnique({ where: { id: "singleton" } });
  const hours = setting?.abandonedAfterHours ?? DEFAULT_HOURS;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  const candidates = await prisma.gateEntry.findMany({
    where: { abandonedFiredAt: null, passedAt: { lt: cutoff } },
    select: {
      id: true,
      assessmentId: true,
      visitorId: true,
      clientIp: true,
      userAgent: true,
      fbp: true,
      fbc: true,
      country: true,
      city: true,
      region: true,
      postalCode: true,
      assessment: {
        select: { slug: true, title: true, fireMetaCapi: true, metaEvents: true, tenantId: true },
      },
    },
    take: BATCH,
  });

  let fired = 0;
  for (const g of candidates) {
    if (await fireAbandonedForEntry(g)) fired++;
  }

  return { fired, scanned: candidates.length };
}

/** The fields the abandoned decision needs, however the visitor arrived at it. */
export type AbandonCandidate = {
  id: string;
  assessmentId: string;
  visitorId: string;
  clientIp: string | null;
  userAgent: string | null;
  fbp: string | null;
  fbc: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  assessment: {
    slug: string;
    title: string;
    fireMetaCapi: boolean;
    metaEvents: unknown;
    tenantId: string | null;
  };
};

/**
 * Decide and fire AssessmentAbandoned for ONE gate entry. Returns true if an event
 * was sent.
 *
 * Shared by the nightly sweep and the beacon the opt-in page sends when the visitor
 * leaves, so the two can never disagree about who counts as abandoned. The sweep is
 * the backstop: a browser that is killed outright, has JS blocked, or never delivers
 * the beacon still gets picked up later.
 *
 * ABANDONED MEANS "DID NOT OPT IN", not "did not finish". The test is whether any
 * submission exists for this visitor, because the submission IS the opt-in - it is
 * created by that form and by nothing else. Someone who opted in and then stopped is
 * a lead we already hold and already told Meta about via CompleteRegistration; putting
 * them in the retargeting audience would pay to chase a contact we have.
 *
 * The claim is taken BEFORE the send and regardless of the verdict, so the row reads
 * "decided" rather than "sent": a visitor who opted in is stamped too, which is what
 * stops the sweep reconsidering them nightly for ever.
 */
export async function fireAbandonedForEntry(g: AbandonCandidate): Promise<boolean> {
  // Any submission at all for this visitor on this assessment means they opted in.
  const optedIn = await prisma.submission.count({
    where: { assessmentId: g.assessmentId, metaExternalId: g.visitorId },
  });

  const claim = await prisma.gateEntry.updateMany({
    where: { id: g.id, abandonedFiredAt: null },
    data: { abandonedFiredAt: new Date() },
  });
  if (claim.count === 0) return false; // another run, or the beacon, got there first

  if (optedIn > 0) return false;
  // The assessment may have been switched to routed (no Meta) after the pass.
  if (!metaEventOn(g.assessment.fireMetaCapi, g.assessment.metaEvents, "abandoned")) return false;

  const outcome = await sendAndLogLifecycleCapi(
    {
      eventName: ABANDONED_EVENT,
      eventId: `gate-abandoned:${g.id}`, // stable: a retry can never double-count
      eventTimeMs: Date.now(),
      eventSourceUrl: `${env.NEXT_PUBLIC_APP_URL}/a/${g.assessment.slug}`,
      user: {
        clientIpAddress: g.clientIp,
        clientUserAgent: g.userAgent,
        fbp: g.fbp,
        fbc: g.fbc,
        country: g.country,
        city: g.city,
        state: g.region,
        zip: g.postalCode,
        externalId: g.visitorId,
      },
      customData: { content_name: g.assessment.title, assessment_name: g.assessment.title },
    },
    { tenantId: g.assessment.tenantId, submissionId: null },
  ).catch(() => ({ ok: false }) as { ok: boolean });

  // Counted like every other funnel event, so "Fired to Meta" can show the
  // retargeting audience actually being built. The sweep never did this, which is why
  // AssessmentAbandoned has never appeared on the Stats page.
  await bumpFunnelEventCount({
    assessmentId: g.assessmentId,
    tenantId: g.assessment.tenantId,
    eventName: ABANDONED_EVENT,
    ok: outcome.ok,
  });
  return outcome.ok;
}
