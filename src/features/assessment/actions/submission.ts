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
import { type EmitInput } from "@/features/events/types";
import { normalizeIdentifier, evaluateLockout } from "@/features/assessment/lockout";
import { type ActionResult, nullifyEmpty } from "@/features/assessment/actions/shared";

export type StartResult =
  | { status: "started"; submissionId: string }
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
  lead: { firstName: string | null; lastName: string | null; email: string | null; mobile: string | null },
  attr: ReturnType<typeof normalizeAttribution>,
) {
  const base: EmitInput = {
    submissionId,
    tenant: assessment.tenant,
    assessment: { id: assessment.id, slug: assessment.slug, title: assessment.title },
    lead,
    attribution: attr ?? undefined,
  };
  await emitEvent(EventType.LEAD_CREATED, base);
  await emitEvent(EventType.ASSESSMENT_STARTED, base);
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

  // Lockout path — serialize per-identifier with an advisory lock so concurrent
  // double-submits can't slip two leads through, and a blocked retaker creates
  // NO row / event / webhook. (Set retakePolicy=UNLIMITED to allow free retakes.)
  if (assessment.retakePolicy !== "UNLIMITED" && identifierValue) {
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
      // Dedupe genuine double-clicks: reuse a very recent, non-abandoned start
      // for the same identifier (short window only — NOT a stale hours-old row).
      // Refresh its lead snapshot so the latest entered details win.
      const REUSE_WINDOW_MS = 5 * 60 * 1000;
      const recent = await tx.submission.findFirst({
        where: {
          assessmentId: assessment.id,
          identifierValue,
          status: "STARTED",
          abandonedAt: null,
          startedAt: { gte: new Date(Date.now() - REUSE_WINDOW_MS) },
        },
        orderBy: { startedAt: "desc" },
        select: { id: true },
      });
      if (recent) {
        await tx.submission.update({ where: { id: recent.id }, data: submissionData });
        return { kind: "reused" as const, submissionId: recent.id };
      }
      const created = await tx.submission.create({ data: submissionData, select: { id: true } });
      return { kind: "created" as const, submissionId: created.id };
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
    if (outcome.kind === "created") await emitStart(assessment, outcome.submissionId, leadFields, attr);
    return { ok: true, data: { status: "started", submissionId: outcome.submissionId } };
  }

  // No lockout (UNLIMITED / admin / no identifier): create + emit directly.
  const created = await prisma.submission.create({ data: submissionData, select: { id: true } });
  await emitStart(assessment, created.id, leadFields, attr);
  return { ok: true, data: { status: "started", submissionId: created.id } };
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
): Promise<ActionResult<{ submissionId: string }>> {
  const parsed = answersSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid answers." };
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { id: true, status: true, assessmentId: true, attribution: true },
  });
  if (!submission) return { ok: false, error: "Submission not found." };
  if (submission.status === "COMPLETED") {
    return { ok: true, data: { submissionId } };
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id: submission.assessmentId },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
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
      },
    }),
  ]);

  // If a concurrent writer already completed this submission, do not re-fire CRM.
  const swap = tx[tx.length - 1] as { count: number } | undefined;
  if (!swap || swap.count === 0) {
    return { ok: true, data: { submissionId } };
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
    attribution: normalizeAttribution(submission.attribution) ?? undefined,
  } satisfies EmitInput);

  return { ok: true, data: { submissionId } };
}
