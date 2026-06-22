import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  buildCategoryQuestionBreakdown,
  type CategoryQuestionBreakdown,
  type ChosenAnswer,
} from "@/lib/result/questions";

/**
 * Load the per-question breakdown for a submission from the stored answers + the
 * assessment's questions/options. The data is denormalized into SubmissionAnswer
 * at completion, so this works for ANY completed submission (old or new) — it
 * powers both the result-page display and the AI regenerate path without needing
 * the breakdown baked into the snapshot.
 */
export async function getSubmissionQuestionBreakdown(
  submissionId: string,
): Promise<CategoryQuestionBreakdown[]> {
  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { assessmentId: true },
  });
  if (!sub) return [];

  const [answers, categories] = await Promise.all([
    prisma.submissionAnswer.findMany({
      where: { submissionId },
      select: { questionId: true, value: true, optionId: true },
    }),
    prisma.category.findMany({
      where: { assessmentId: sub.assessmentId },
      orderBy: { displayOrder: "asc" },
      select: {
        name: true,
        questions: {
          orderBy: { displayOrder: "asc" },
          select: {
            id: true,
            text: true,
            weight: true,
            options: { select: { id: true, value: true, label: true } },
          },
        },
      },
    }),
  ]);

  const answerByQuestionId = new Map<string, ChosenAnswer>(
    answers.map((a) => [a.questionId, { value: a.value, optionId: a.optionId }]),
  );
  return buildCategoryQuestionBreakdown(categories, answerByQuestionId);
}
