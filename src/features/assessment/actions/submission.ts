"use server";

import { prisma } from "@/lib/db/prisma";
import {
  leadSchema,
  answersSchema,
  type LeadInput,
  type AnswersInput,
} from "@/features/assessment/schemas";
import {
  computeScores,
  pickResultBand,
  type ScoringQuestion,
} from "@/features/assessment/scoring";
import { EventType, Prisma } from "@prisma/client";
import { emitEvent } from "@/lib/events/emit";
import { normalizeAttribution } from "@/lib/events/payload";
import { type EmitInput, type PayloadCategory } from "@/features/events/types";
import { getCurrentUser } from "@/lib/auth/session";
import { isPlatformOwner } from "@/lib/auth/platform";
import { normalizeIdentifier, evaluateLockout } from "@/features/assessment/lockout";
import { generateCustomerId, generateToken } from "@/lib/ids";
import { env } from "@/lib/env";
import { randomUUID } from "crypto";
import { sendCapiEvent, isCapiConfigured } from "@/lib/meta/send";
import { getMetaRequestContext } from "@/lib/meta/request-context";
import { generatePersonalStatement } from "@/lib/ai/generate";
import { buildResultSnapshot, mapCategoryResult } from "@/lib/result/snapshot";
import { type ActionResult, nullifyEmpty } from "@/features/assessment/actions/shared";

/** The ONE system-level fallback for the result-token TTL (overridable per
 *  assessment). 30 days — long enough that revisits and the emailed result link
 *  (clicked hours/days later) still resolve; the token is a high-entropy,
 *  per-submission id behind which only that person's own result sits. */
const DEFAULT_RESULT_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/** Destination URL the respondent lands on; falls back to the internal result page. */
function buildResultUrl(
  targetUrl: string | null,
  slug: string,
  submissionId: string,
  token: string | null,
): string {
  if (targetUrl && token) {
    try {
      const u = new URL(targetUrl);
      u.searchParams.set("t", token); // correct even if targetUrl already has a query/fragment
      return u.toString();
    } catch {
      /* malformed targetUrl — fall back to the internal result page */
    }
  }
  return `${env.NEXT_PUBLIC_APP_URL}/a/${slug}/r/${submissionId}`;
}


export type StartResult =
  | { status: "started"; submissionId: string; eventId?: string }
  | {
      status: "locked";
      policy: "DELAYED" | "NEVER";
      lastCompletedAt: string | null;
      nextAvailableAt: string | null; // null = never (NEVER policy)
    };

type StartAssessment = {
  id: string;
  slug: string;
  title: string;
  tenant: { id: string; slug: string; name: string } | null;
};

/** Fire lead.created + assessment.started for a freshly created submission. */
async function emitStart(
  assessment: StartAssessment,
  submissionId: string,
  customerId: string,
  lead: { firstName: string | null; lastName: string | null; email: string | null; mobile: string | null },
  attr: ReturnType<typeof normalizeAttribution>,
) {
  const base: EmitInput = {
    submissionId,
    customerId,
    tenant: assessment.tenant,
    assessment: { id: assessment.id, slug: assessment.slug, title: assessment.title },
    lead,
    attribution: attr ?? undefined,
  };
  await emitEvent(EventType.LEAD_CREATED, base);
  await emitEvent(EventType.ASSESSMENT_STARTED, base);
}

/**
 * Fire everything that happens on a NEW registration: the CRM events (lead.created
 * + assessment.started) AND a server-side Meta CAPI `CompleteRegistration`.
 * Returns the CAPI eventId so the browser pixel can fire with the SAME id and
 * Meta deduplicates the two. Called ONLY on the created path (never on resume),
 * so a registration is counted exactly once.
 */
async function fireRegistration(
  assessment: StartAssessment,
  submissionId: string,
  customerId: string,
  lead: { firstName: string | null; lastName: string | null; email: string | null; mobile: string | null },
  attr: ReturnType<typeof normalizeAttribution>,
): Promise<string> {
  await emitStart(assessment, submissionId, customerId, lead, attr);
  const eventId = randomUUID();
  // Server-side Meta CAPI. Inert unless configured; getMetaRequestContext is
  // fail-soft; the send is fire-and-forget so Meta's network never adds latency.
  // The eventId is returned regardless so the browser pixel can dedup.
  if (isCapiConfigured()) {
    const ctx = await getMetaRequestContext();
    void sendCapiEvent({
      eventName: "CompleteRegistration",
      eventId,
      eventTimeMs: Date.now(),
      eventSourceUrl: `${env.NEXT_PUBLIC_APP_URL}/a/${assessment.slug}`,
      user: {
        email: lead.email,
        phone: lead.mobile,
        firstName: lead.firstName,
        lastName: lead.lastName,
        ...ctx,
      },
      customData: { content_name: assessment.title, assessment_name: assessment.title },
    }).catch(() => {});
  }
  return eventId;
}

/**
 * Start a submission: validate the lead per the assessment's capture config,
 * create the record immediately (status STARTED), and return its id so the
 * respondent can continue into the questions.
 */
export async function startSubmission(
  slug: string,
  lead: LeadInput,
  attribution?: Record<string, string>,
  preview?: boolean,
): Promise<ActionResult<StartResult>> {
  const assessment = await prisma.assessment.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      title: true,
      tenantId: true,
      tenant: { select: { id: true, slug: true, name: true } },
      collectFirstName: true,
      firstNameRequired: true,
      collectLastName: true,
      lastNameRequired: true,
      collectEmail: true,
      emailRequired: true,
      collectMobile: true,
      mobileRequired: true,
      retakePolicy: true,
      retakeDays: true,
      uniqueIdentifier: true,
    },
  });
  if (!assessment) return { ok: false, error: "Assessment not available." };

  const parsed = leadSchema.safeParse(lead);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details." };
  }
  const d = parsed.data;

  const firstName = nullifyEmpty(d.firstName);
  const lastName = nullifyEmpty(d.lastName);
  const email = nullifyEmpty(d.email);
  const mobile = nullifyEmpty(d.mobile);

  if (assessment.collectFirstName && assessment.firstNameRequired && !firstName)
    return { ok: false, error: "First name is required." };
  if (assessment.collectLastName && assessment.lastNameRequired && !lastName)
    return { ok: false, error: "Last name is required." };
  if (assessment.collectEmail && assessment.emailRequired && !email)
    return { ok: false, error: "Email is required." };
  if (assessment.collectMobile && assessment.mobileRequired && !mobile)
    return { ok: false, error: "Mobile number is required." };

  // Sanitize untrusted attribution from the landing URL (known keys, capped).
  const attr = normalizeAttribution(attribution);
  const identifierValue = normalizeIdentifier(assessment.uniqueIdentifier, { email, mobile });
  const leadFields = { firstName, lastName, email, mobile };
  // Mint the customerId once (8 chars; the @unique index is the collision backstop).
  const newCustomerId = generateCustomerId();

  // Admin preview/testing bypasses the lockout — ONLY when the ?preview=1 flag is
  // set AND the caller is the authenticated platform owner (never the flag alone).
  let adminPreview = false;
  if (preview) {
    const u = await getCurrentUser();
    adminPreview = u ? isPlatformOwner(u.email) : false;
  }

  const submissionData = {
    assessmentId: assessment.id,
    tenantId: assessment.tenantId,
    status: "STARTED" as const,
    leadFirstName: assessment.collectFirstName ? firstName : null,
    leadLastName: assessment.collectLastName ? lastName : null,
    leadEmail: assessment.collectEmail ? email : null,
    leadMobile: assessment.collectMobile ? mobile : null,
    identifierValue,
    ...(attr ? { attribution: attr as unknown as Prisma.InputJsonValue } : {}),
  };

  // Lockout path — serialize per-(assessment + identifier) with an advisory lock
  // so concurrent submits can't slip two leads through, and a blocked retaker
  // creates NO row / event / webhook. Lockout is scoped to THIS assessment +
  // identifier (completing assessment A never blocks assessment B).
  // State machine: COMPLETED (in window) = hard lock; an in-flight STARTED /
  // ABANDONED row = resume until completed; otherwise create a new submission.
  // (Set retakePolicy=UNLIMITED to allow free retakes; ?preview=1 as owner bypasses.)
  if (!adminPreview && assessment.retakePolicy !== "UNLIMITED" && identifierValue) {
    const policy = assessment.retakePolicy as "DELAYED" | "NEVER";
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${assessment.id}:${identifierValue}`}, 0))`;
      const last = await tx.submission.findFirst({
        where: { assessmentId: assessment.id, identifierValue, status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true },
      });
      const verdict = evaluateLockout(policy, assessment.retakeDays, last?.completedAt ?? null, new Date());
      if (verdict.locked) {
        return {
          kind: "locked" as const,
          lastCompletedAt: last?.completedAt ?? null,
          nextAvailableAt: verdict.nextAvailableAt,
        };
      }
      // Resume an in-flight attempt (STARTED, including ABANDONED) until it is
      // completed — refresh its lead snapshot so the latest entered details win.
      // Keep the existing customerId (mint one only if the row predates it).
      const inflight = await tx.submission.findFirst({
        where: { assessmentId: assessment.id, identifierValue, status: "STARTED" },
        orderBy: { startedAt: "desc" },
        select: { id: true, customerId: true },
      });
      if (inflight) {
        const customerId = inflight.customerId ?? newCustomerId;
        await tx.submission.update({
          where: { id: inflight.id },
          data: inflight.customerId ? submissionData : { ...submissionData, customerId },
        });
        return { kind: "reused" as const, submissionId: inflight.id, customerId };
      }
      const created = await tx.submission.create({
        data: { ...submissionData, customerId: newCustomerId },
        select: { id: true },
      });
      return { kind: "created" as const, submissionId: created.id, customerId: newCustomerId };
    });

    if (outcome.kind === "locked") {
      return {
        ok: true,
        data: {
          status: "locked",
          policy,
          lastCompletedAt: outcome.lastCompletedAt?.toISOString() ?? null,
          nextAvailableAt: outcome.nextAvailableAt?.toISOString() ?? null,
        },
      };
    }
    let eventId: string | undefined;
    if (outcome.kind === "created") {
      eventId = await fireRegistration(assessment, outcome.submissionId, outcome.customerId, leadFields, attr);
    }
    return {
      ok: true,
      data: { status: "started", submissionId: outcome.submissionId, ...(eventId ? { eventId } : {}) },
    };
  }

  // No lockout (UNLIMITED / admin / no identifier): create + emit directly.
  const created = await prisma.submission.create({
    data: { ...submissionData, customerId: newCustomerId },
    select: { id: true },
  });
  const eventId = await fireRegistration(assessment, created.id, newCustomerId, leadFields, attr);
  return { ok: true, data: { status: "started", submissionId: created.id, eventId } };
}

/**
 * "Email my previous results": for a returning (locked-out) respondent, find their
 * latest COMPLETED submission by identifier and emit result.link_requested so the
 * CRM emails the secure result link to the registered address. NEVER reveals the
 * link/score on-screen, and returns the same generic result whether or not a
 * match exists (no enumeration).
 */
export async function requestPreviousResults(
  slug: string,
  lead: LeadInput,
): Promise<ActionResult> {
  const assessment = await prisma.assessment.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      title: true,
      uniqueIdentifier: true,
      tenant: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!assessment) return { ok: false, error: "Assessment not available." };

  const parsed = leadSchema.safeParse(lead);
  if (!parsed.success) return { ok: true }; // generic; never signal validity

  const identifierValue = normalizeIdentifier(assessment.uniqueIdentifier, {
    email: nullifyEmpty(parsed.data.email),
    mobile: nullifyEmpty(parsed.data.mobile),
  });
  if (!identifierValue) return { ok: true };

  const last = await prisma.submission.findFirst({
    where: { assessmentId: assessment.id, identifierValue, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    select: {
      id: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      totalScore: true,
      maxScore: true,
      attribution: true,
      resultBand: { select: { level: true, title: true } },
    },
  });

  // Only emit when there is a deliverable email address (the CRM emails the link).
  if (last && last.leadEmail) {
    const total = last.totalScore ?? 0;
    const max = last.maxScore ?? 0;
    const percentage = max > 0 ? Math.round((total / max) * 100) : 0;
    await emitEvent(EventType.RESULT_LINK_REQUESTED, {
      submissionId: last.id,
      tenant: assessment.tenant,
      assessment: { id: assessment.id, slug: assessment.slug, title: assessment.title },
      lead: {
        firstName: last.leadFirstName,
        lastName: last.leadLastName,
        email: last.leadEmail,
        mobile: last.leadMobile,
      },
      score: { total, max, percentage },
      resultBand: last.resultBand ? { level: last.resultBand.level, title: last.resultBand.title } : null,
      attribution: normalizeAttribution(last.attribution) ?? undefined,
    } satisfies EmitInput);
  }

  return { ok: true };
}

/**
 * Complete a submission: validate answers, run the scoring engine, persist
 * answers + category scores + total + matched result band, mark COMPLETED,
 * then fire the CRM automation hook (non-blocking).
 */
export async function completeSubmission(
  submissionId: string,
  input: AnswersInput,
): Promise<ActionResult<{ submissionId: string; resultUrl: string; eventId?: string }>> {
  const parsed = answersSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid answers." };
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      status: true,
      assessmentId: true,
      attribution: true,
      customerId: true,
      resultToken: true,
      leadFirstName: true,
      assessment: { select: { slug: true, targetUrl: true } },
    },
  });
  if (!submission) return { ok: false, error: "Submission not found." };
  if (submission.status === "COMPLETED") {
    const resultUrl = buildResultUrl(
      submission.assessment.targetUrl,
      submission.assessment.slug,
      submissionId,
      submission.resultToken,
    );
    return { ok: true, data: { submissionId, resultUrl } };
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id: submission.assessmentId },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      targetUrl: true,
      tokenTtlSeconds: true,
      tenant: { select: { id: true, slug: true, name: true } },
      categories: {
        select: {
          id: true,
          name: true,
          questions: {
            select: {
              id: true,
              weight: true,
              required: true,
              options: { select: { id: true, value: true } },
            },
          },
          bands: {
            select: { id: true, label: true, meaning: true, minScore: true, maxScore: true, displayOrder: true },
          },
        },
      },
      resultBands: {
        select: { id: true, level: true, title: true, description: true, minScore: true, maxScore: true, displayOrder: true },
      },
    },
  });
  if (!assessment) return { ok: false, error: "Assessment not found." };
  // Re-check publication: an admin may have unpublished it mid-flight, in which
  // case we must not score or emit a lead to the CRM.
  if (assessment.status !== "PUBLISHED") {
    return { ok: false, error: "This assessment is no longer available." };
  }

  // Index questions and options for validation + scoring.
  const questions = assessment.categories.flatMap((c) =>
    c.questions.map((q) => ({ ...q, categoryId: c.id })),
  );
  const questionById = new Map(questions.map((q) => [q.id, q]));

  // Build answer value map (last answer per question wins).
  const answerValueByQuestionId = new Map<string, number>();
  const optionByQuestionId = new Map<string, string>();
  for (const a of parsed.data.answers) {
    const q = questionById.get(a.questionId);
    if (!q) return { ok: false, error: "Answer references an unknown question." };
    const option = q.options.find((o) => o.id === a.optionId);
    if (!option) return { ok: false, error: "Answer references an invalid option." };
    answerValueByQuestionId.set(a.questionId, option.value);
    optionByQuestionId.set(a.questionId, option.id);
  }

  // Enforce required questions.
  const missingRequired = questions.filter(
    (q) => q.required && !answerValueByQuestionId.has(q.id),
  );
  if (missingRequired.length > 0) {
    return {
      ok: false,
      error: `Please answer all required questions (${missingRequired.length} remaining).`,
    };
  }

  // Score.
  const scoringQuestions: ScoringQuestion[] = questions.map((q) => ({
    id: q.id,
    categoryId: q.categoryId,
    weight: q.weight,
    maxValue: q.options.reduce((m, o) => Math.max(m, o.value), 0),
  }));
  const { categoryScores, totalScore, maxScore, percentage } = computeScores(
    scoringQuestions,
    answerValueByQuestionId,
  );
  // Bands are matched against the percentage (invariant to skipped optional Qs).
  const band = pickResultBand(assessment.resultBands, percentage);

  // Per-category band mapping (reuses the generic pickResultBand).
  const categoryById = new Map(assessment.categories.map((c) => [c.id, c]));
  const categoryResults: PayloadCategory[] = categoryScores.map((cs) => {
    const cat = categoryById.get(cs.categoryId);
    return mapCategoryResult(cat?.name ?? "", cs.score, cs.maxScore, cat?.bands ?? []);
  });

  // Opaque public ids + denormalized read-endpoint snapshot + destination URL.
  const customerId = submission.customerId ?? generateCustomerId();
  const token = generateToken();
  const ttl = assessment.tokenTtlSeconds ?? DEFAULT_RESULT_TOKEN_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttl * 1000);
  // Guard the billable, multi-second AI call: if a concurrent writer already
  // completed this submission (it passed the COMPLETED check at the top but won
  // the race during scoring), return their result instead of generating again.
  const recheck = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { status: true, resultToken: true },
  });
  if (recheck?.status === "COMPLETED") {
    return {
      ok: true,
      data: {
        submissionId,
        resultUrl: buildResultUrl(assessment.targetUrl, assessment.slug, submissionId, recheck.resultToken),
      },
    };
  }

  // AI personalized statement (RAW scores only — no per-category interpretation).
  // Fail-soft: null when AI is off/slow/errors, and the page falls back to the
  // static suggestion. Generated once and stored on the submission/snapshot.
  const aiStatement = await generatePersonalStatement({
    firstName: submission.leadFirstName,
    assessmentTitle: assessment.title,
    scoreRaw: totalScore,
    max: maxScore,
    percentage: Math.round(percentage),
    band: band?.title ?? null,
    categories: categoryScores.map((cs) => ({
      name: categoryById.get(cs.categoryId)?.name ?? "",
      score: cs.score,
      max: cs.maxScore,
    })),
  });

  const snapshot = buildResultSnapshot({
    customerId,
    scoreRaw: totalScore,
    max: maxScore,
    scorePercent: Math.round(percentage),
    resultBand: band?.title ?? null,
    resultSuggestion: band?.description ?? null,
    aiStatement,
    categories: categoryResults,
  });
  const resultUrl = buildResultUrl(assessment.targetUrl, assessment.slug, submissionId, token);

  // Persist atomically. The final statement is a compare-and-swap on status:
  // only a writer that flips STARTED -> COMPLETED "wins". This makes scoring
  // persistence and the CRM dispatch exactly-once under concurrent double-submits.
  const tx = await prisma.$transaction([
    prisma.submissionAnswer.deleteMany({ where: { submissionId } }),
    prisma.submissionCategoryScore.deleteMany({ where: { submissionId } }),
    prisma.submissionAnswer.createMany({
      data: Array.from(answerValueByQuestionId.entries()).map(
        ([questionId, value]) => ({
          submissionId,
          questionId,
          optionId: optionByQuestionId.get(questionId) as string,
          value,
        }),
      ),
    }),
    prisma.submissionCategoryScore.createMany({
      data: categoryScores.map((cs) => ({
        submissionId,
        categoryId: cs.categoryId,
        score: cs.score,
        maxScore: cs.maxScore,
      })),
    }),
    prisma.submission.updateMany({
      where: { id: submissionId, status: "STARTED" },
      data: {
        status: "COMPLETED",
        totalScore,
        maxScore,
        resultBandId: band?.id ?? null,
        completedAt: new Date(),
        resultToken: token,
        resultTokenExpiresAt: expiresAt,
        resultSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        aiStatement,
        ...(submission.customerId ? {} : { customerId }),
      },
    }),
  ]);

  // If a concurrent writer already completed this submission, do not re-fire CRM;
  // return that writer's destination URL.
  const swap = tx[tx.length - 1] as { count: number } | undefined;
  if (!swap || swap.count === 0) {
    const existing = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { resultToken: true },
    });
    return {
      ok: true,
      data: {
        submissionId,
        resultUrl: buildResultUrl(assessment.targetUrl, assessment.slug, submissionId, existing?.resultToken ?? null),
      },
    };
  }

  // Emit assessment.completed. EventLog is always written; webhook delivery
  // (incl. the CRM endpoint) is non-blocking and never fails this flow. Run only
  // for the winning writer (exactly-once).
  //
  // NOTE: result.generated is intentionally NOT emitted — scoring is synchronous,
  // so it would be a duplicate of assessment.completed (same instant, same data)
  // and create duplicate CRM records. See ACTIVE_EVENT_TYPES in events/types.ts.
  const full = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
    },
  });

  await emitEvent(EventType.ASSESSMENT_COMPLETED, {
    submissionId,
    customerId,
    tenant: assessment.tenant,
    assessment: { id: assessment.id, slug: assessment.slug, title: assessment.title },
    lead: {
      firstName: full?.leadFirstName ?? null,
      lastName: full?.leadLastName ?? null,
      email: full?.leadEmail ?? null,
      mobile: full?.leadMobile ?? null,
    },
    score: { total: totalScore, max: maxScore, percentage },
    resultBand: band ? { level: band.level, title: band.title } : null,
    categories: categoryResults,
    resultUrl,
    aiStatement,
    attribution: normalizeAttribution(submission.attribution) ?? undefined,
  } satisfies EmitInput);

  // Server-side Meta CAPI (AssessmentCompleted). Runs ONLY for the winning
  // writer (exactly-once); the returned eventId dedups the browser pixel.
  // Inert unless configured; fail-soft context; non-blocking send.
  const eventId = randomUUID();
  if (isCapiConfigured()) {
    const ctx = await getMetaRequestContext();
    void sendCapiEvent({
      eventName: "AssessmentCompleted",
      eventId,
      eventTimeMs: Date.now(),
      eventSourceUrl: `${env.NEXT_PUBLIC_APP_URL}/a/${assessment.slug}`,
      user: {
        email: full?.leadEmail ?? null,
        phone: full?.leadMobile ?? null,
        firstName: full?.leadFirstName ?? null,
        lastName: full?.leadLastName ?? null,
        ...ctx,
      },
      customData: { content_name: assessment.title, assessment_name: assessment.title },
    }).catch(() => {});
  }

  return { ok: true, data: { submissionId, resultUrl, eventId } };
}
