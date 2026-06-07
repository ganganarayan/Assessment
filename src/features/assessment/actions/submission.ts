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
import { notifySubmissionCompleted } from "@/lib/crm/notify";
import { type ActionResult, nullifyEmpty } from "@/features/assessment/actions/shared";

/**
 * Start a submission: validate the lead per the assessment's capture config,
 * create the record immediately (status STARTED), and return its id so the
 * respondent can continue into the questions.
 */
export async function startSubmission(
  slug: string,
  lead: LeadInput,
): Promise<ActionResult<{ submissionId: string }>> {
  const assessment = await prisma.assessment.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      tenantId: true,
      collectFirstName: true,
      firstNameRequired: true,
      collectLastName: true,
      lastNameRequired: true,
      collectEmail: true,
      emailRequired: true,
      collectMobile: true,
      mobileRequired: true,
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

  const submission = await prisma.submission.create({
    data: {
      assessmentId: assessment.id,
      tenantId: assessment.tenantId,
      status: "STARTED",
      leadFirstName: assessment.collectFirstName ? firstName : null,
      leadLastName: assessment.collectLastName ? lastName : null,
      leadEmail: assessment.collectEmail ? email : null,
      leadMobile: assessment.collectMobile ? mobile : null,
    },
    select: { id: true },
  });

  return { ok: true, data: { submissionId: submission.id } };
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
    select: { id: true, status: true, assessmentId: true },
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
  const categoryNameById = new Map(
    assessment.categories.map((c) => [c.id, c.name]),
  );

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

  // Fire CRM automation (non-blocking; failures never break the result).
  const full = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      completedAt: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
    },
  });
  if (full) {
    await notifySubmissionCompleted({
      submissionId: full.id,
      completedAt: (full.completedAt ?? new Date()).toISOString(),
      assessment: { id: assessment.id, slug: assessment.slug, title: assessment.title },
      lead: {
        firstName: full.leadFirstName,
        lastName: full.leadLastName,
        email: full.leadEmail,
        mobile: full.leadMobile,
      },
      scores: {
        total: totalScore,
        max: maxScore,
        percentage,
        categories: categoryScores.map((cs) => ({
          categoryId: cs.categoryId,
          name: categoryNameById.get(cs.categoryId) ?? "",
          score: cs.score,
          maxScore: cs.maxScore,
        })),
      },
      result: band
        ? { level: band.level, title: band.title, description: band.description }
        : null,
    });
  }

  return { ok: true, data: { submissionId } };
}
