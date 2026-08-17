import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isClinicRole, type ClinicRole } from "@/lib/scoring/clinic-audit";

/**
 * The respondent's answers for a CLINIC_AUDIT submission, grouped by category and
 * in question order — with, for scored questions, the funnel role, the number the
 * engine ACTUALLY used, and where that number came from (a typed exact figure vs.
 * the selected option's stored value).
 *
 * This is the diagnostic that makes a misconfigured option value obvious: it shows
 * the chosen option's LABEL next to the value carried, so e.g. an option labelled
 * "7 or 8" (out of 10) carrying the value 7 — which the engine reads as 7%, not
 * 75% — is visible at a glance instead of silently producing absurd revenue.
 */
export interface ClinicAnswerRow {
  questionId: string;
  text: string;
  /** The selected option's label, e.g. "7 or 8". Null when unanswered. */
  answerLabel: string | null;
  /** Funnel role, when this question feeds the engine. Null = context/qualifier. */
  role: ClinicRole | null;
  /** The option's stored number (rates as whole percent), when scored. */
  optionValue: number | null;
  /** The respondent's typed exact figure, when they gave one. */
  actualValue: number | null;
}

export interface ClinicAnswerCategory {
  name: string;
  page: number;
  rows: ClinicAnswerRow[];
}

export async function getClinicAnswers(submissionId: string): Promise<ClinicAnswerCategory[]> {
  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { assessmentId: true, clinicActualAnswers: true },
  });
  if (!sub) return [];

  const [answers, categories] = await Promise.all([
    prisma.submissionAnswer.findMany({
      where: { submissionId },
      select: { questionId: true, optionId: true },
    }),
    prisma.category.findMany({
      where: { assessmentId: sub.assessmentId },
      orderBy: { displayOrder: "asc" },
      select: {
        name: true,
        page: true,
        questions: {
          orderBy: { displayOrder: "asc" },
          select: {
            id: true,
            text: true,
            scoringRole: true,
            options: { select: { id: true, value: true, label: true } },
          },
        },
      },
    }),
  ]);

  const chosenByQuestion = new Map(answers.map((a) => [a.questionId, a.optionId]));
  const actualRaw = (sub.clinicActualAnswers ?? {}) as Record<string, unknown>;

  return categories.map((c) => ({
    name: c.name,
    page: c.page ?? 1,
    rows: c.questions.map((q) => {
      const optionId = chosenByQuestion.get(q.id) ?? null;
      const opt = optionId ? q.options.find((o) => o.id === optionId) ?? null : null;
      const role = isClinicRole(q.scoringRole ?? "") ? (q.scoringRole as ClinicRole) : null;
      const rawActual = actualRaw[q.id];
      const actual = typeof rawActual === "string" && Number.isFinite(Number(rawActual)) ? Number(rawActual) : null;
      return {
        questionId: q.id,
        text: q.text,
        answerLabel: opt?.label ?? null,
        role,
        optionValue: role ? opt?.value ?? null : null,
        actualValue: role ? actual : null,
      };
    }),
  }));
}
