import { prisma } from "@/lib/db/prisma";
import { formatIST, formatISTDate } from "@/lib/date";
import { ONBOARDING_STEPS } from "@/features/onboarding/steps";

/**
 * WHAT THIS WORKSPACE HAS ACTUALLY DONE - the only input any decision is made from.
 *
 * Everything here is measured, never inferred. The router reads it, the model reads
 * it, and the plan row keeps a copy, which is the only way to answer "why did it say
 * that" a fortnight later when the workspace looks nothing like it did.
 *
 * 🔴 NO CONTACT DETAILS BEYOND A FIRST NAME. This object is serialised into a prompt
 * and sent to a third party. The sender needs the email address and the number; the
 * decision does not, so they are resolved separately at send time and never travel
 * with the facts. A fact set that cannot leak an address cannot leak an address.
 *
 * NOT `server-only`: the Railway cron runs outside Next, where that package does not
 * resolve. Same reason lib/features/release.ts is not marked either.
 */

/** Four days, which is the window the owner asked for and the one that fits a prompt. */
export const HISTORY_DAYS = 4;

export interface LifecycleFacts {
  workspace: string;
  /** First name only. Used for the greeting, nothing else. */
  firstName: string | null;
  /** Day N of the trial, 1-based. Day 1 is the day they signed up. */
  trialDay: number;
  daysLeft: number;
  trialEndsOn: string | null;
  signedUpOn: string;
  logins: {
    count: number;
    lastOn: string | null;
    daysSinceLast: number | null;
  };
  onboarding: {
    answered: number;
    total: number;
    /** The label of the furthest step they answered. Null = never started. */
    lastStep: string | null;
    /** Labels of what is still open, first three only. */
    remaining: string[];
  };
  funnels: {
    total: number;
    published: number;
    /** Titles, so the copy can name the thing rather than say "your funnel". */
    titles: string[];
  };
  responses: {
    total: number;
    recent: number;
    firstOn: string | null;
  };
  call: {
    booked: boolean;
    /** BOOKED | CANCELLED | ATTENDED | NO_SHOW, or null when there is none. */
    status: string | null;
    startsOn: string | null;
  };
  support: { openTickets: number };
  /** Event names from the last four days, with counts. "" when nothing happened. */
  recentActivity: string[];
  history: {
    /** Stage keys already sent, most recent last. Stops a stage repeating. */
    stagesSent: string[];
    lastStage: string | null;
    daysSinceLastMessage: number | null;
  };
}

const DAY_MS = 86_400_000;

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function firstNameOf(name: string | null | undefined, email: string): string | null {
  const trimmed = (name ?? "").trim();
  if (trimmed) return trimmed.split(/\s+/)[0] ?? null;
  // An email local part is a poor name, so it is only used when it reads like one.
  const local = email.split("@")[0] ?? "";
  return /^[a-z]+$/i.test(local) && local.length > 2 ? local : null;
}

/**
 * Build the fact set for one workspace.
 *
 * One pass, eight queries, no N+1: this runs once per trialling tenant per morning
 * and the whole job has to finish inside a cron window.
 */
export async function buildFacts(
  tenantId: string,
  anchorAt: Date,
  now: Date = new Date(),
): Promise<LifecycleFacts | null> {
  const since = new Date(now.getTime() - HISTORY_DAYS * DAY_MS);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, trialEndsAt: true, createdAt: true, deletedAt: true },
  });
  // A deleted workspace is not a lead. Returning null is how the planner skips it
  // without needing to know why.
  if (!tenant || tenant.deletedAt) return null;

  const [owner, answers, assessments, responseCount, recentResponses, firstResponse, appointment, openTickets, events, pastPlans] =
    await Promise.all([
      prisma.user.findFirst({
        where: { tenantId, deletedAt: null, staffPermission: null },
        orderBy: { createdAt: "asc" },
        select: { name: true, email: true, lastLoginAt: true, loginCount: true },
      }),
      prisma.onboardingAnswer.findMany({
        where: { tenantId, skipped: false },
        select: { stepKey: true, answeredAt: true },
        orderBy: { answeredAt: "asc" },
      }),
      prisma.assessment.findMany({
        where: { tenantId },
        select: { title: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.submission.count({ where: { tenantId, status: "COMPLETED" } }),
      prisma.submission.count({ where: { tenantId, status: "COMPLETED", createdAt: { gte: since } } }),
      prisma.submission.findFirst({
        where: { tenantId, status: "COMPLETED" },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.appointment.findFirst({
        where: { tenantId, source: "BOOKING" },
        orderBy: { startAt: "desc" },
        select: { status: true, startAt: true },
      }),
      prisma.supportRequest.count({ where: { tenantId, status: { in: ["OPEN", "AWAITING_US"] } } }),
      prisma.eventLog.findMany({
        where: { tenantId, createdAt: { gte: since } },
        select: { name: true },
        take: 200,
      }),
      prisma.lifecyclePlan.findMany({
        where: { tenantId, status: { in: ["SENT", "APPROVED"] } },
        select: { stageKey: true, sentAt: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 20,
      }),
    ]);

  const answeredKeys = new Set(answers.map((a) => a.stepKey));
  // The step registry calls the label "question", because that is what it is on screen.
  const labelOf = new Map(ONBOARDING_STEPS.map((s) => [s.key, s.question]));
  const lastAnswered = answers.length ? answers[answers.length - 1] : null;

  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);

  const lastPlan = pastPlans.length ? pastPlans[pastPlans.length - 1] : null;
  const lastMessageAt = lastPlan?.sentAt ?? lastPlan?.createdAt ?? null;

  // Day 1 is the day they signed up, not the day after, which is why this is +1.
  const trialDay = daysBetween(anchorAt, now) + 1;
  const daysLeft = tenant.trialEndsAt ? Math.max(0, daysBetween(now, tenant.trialEndsAt)) : 0;

  return {
    workspace: tenant.name,
    firstName: owner ? firstNameOf(owner.name, owner.email) : null,
    trialDay,
    daysLeft,
    trialEndsOn: tenant.trialEndsAt ? formatISTDate(tenant.trialEndsAt) : null,
    signedUpOn: formatISTDate(anchorAt),
    logins: {
      count: owner?.loginCount ?? 0,
      lastOn: owner?.lastLoginAt ? formatISTDate(owner.lastLoginAt) : null,
      daysSinceLast: owner?.lastLoginAt ? daysBetween(owner.lastLoginAt, now) : null,
    },
    onboarding: {
      answered: answeredKeys.size,
      total: ONBOARDING_STEPS.length,
      lastStep: lastAnswered ? (labelOf.get(lastAnswered.stepKey) ?? lastAnswered.stepKey) : null,
      remaining: ONBOARDING_STEPS.filter((s) => !answeredKeys.has(s.key))
        .slice(0, 3)
        .map((s) => s.question),
    },
    funnels: {
      total: assessments.length,
      published: assessments.filter((a) => a.status === "PUBLISHED").length,
      titles: assessments.map((a) => a.title).slice(0, 3),
    },
    responses: {
      total: responseCount,
      recent: recentResponses,
      firstOn: firstResponse ? formatISTDate(firstResponse.createdAt) : null,
    },
    call: {
      booked: !!appointment,
      status: appointment?.status ?? null,
      startsOn: appointment ? formatIST(appointment.startAt) : null,
    },
    support: { openTickets },
    recentActivity: [...counts.entries()].map(([name, n]) => (n > 1 ? `${name} x${n}` : name)),
    history: {
      stagesSent: pastPlans.map((p) => p.stageKey),
      lastStage: lastPlan?.stageKey ?? null,
      daysSinceLastMessage: lastMessageAt ? daysBetween(lastMessageAt, now) : null,
    },
  };
}
