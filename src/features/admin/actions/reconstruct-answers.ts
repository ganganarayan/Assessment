"use server";

import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin, editDenied } from "@/lib/auth/guards";
import { type ResultSnapshot } from "@/lib/result/snapshot";
import { type ActionResult } from "@/features/assessment/actions/shared";

const round2 = (n: number): number => Math.round(n * 100) / 100;
const EPS = 0.01;

export interface ReconstructItem {
  category: string;
  question: string;
  value: number;
}
export interface ReconstructSummary {
  applied: boolean;
  /** Completed submissions scanned. */
  scanned: number;
  /** Answers (re)created. */
  reconstructed: number;
  /** Submissions that had at least one reconstructable answer. */
  affectedSubmissions: number;
  /** Categories skipped because more than one answer was missing (can't split). */
  ambiguous: number;
  /** Missing answers whose inferred value didn't map to an option (skipped). */
  unresolvable: number;
  samples: { customerId: string | null; items: ReconstructItem[] }[];
}

/**
 * Recover answers wiped by the old question-edit cascade. The category SCORE and
 * MAX in the snapshot are denormalized at completion, so they still reflect every
 * question that was answered then. For a category, the missing answer's
 * contribution = snapshot score - sum of surviving answers; we only reconstruct a
 * missing question when (a) exactly one answer is missing in that category AND
 * (b) the snapshot max confirms that question WAS answered at completion (its max
 * contribution is present), AND (c) the inferred value maps to one of its options.
 * This never invents an answer for a genuinely-skipped (optional) question.
 * Idempotent: only creates rows that are missing. `apply=false` is a dry run.
 */
export async function reconstructLostAnswers(
  assessmentId: string,
  apply: boolean,
): Promise<ActionResult<ReconstructSummary>> {
  { const __d = editDenied(await requireSuperAdmin()); if (__d) return __d; }

  const cats = await prisma.category.findMany({
    where: { assessmentId },
    select: {
      name: true,
      questions: {
        select: { id: true, text: true, weight: true, options: { select: { id: true, value: true } } },
      },
    },
  });
  if (cats.length === 0) return { ok: false, error: "No categories found for this assessment." };

  const subs = await prisma.submission.findMany({
    where: { assessmentId, status: "COMPLETED" },
    select: {
      id: true,
      customerId: true,
      resultSnapshot: true,
      answers: { select: { questionId: true, value: true } },
    },
  });

  let reconstructed = 0;
  let affectedSubmissions = 0;
  let ambiguous = 0;
  let unresolvable = 0;
  const samples: ReconstructSummary["samples"] = [];
  const creates: { submissionId: string; questionId: string; optionId: string; value: number }[] = [];

  for (const s of subs) {
    const snap = (s.resultSnapshot ?? null) as ResultSnapshot | null;
    if (!snap || !Array.isArray(snap.categories)) continue;
    const valueByQ = new Map(s.answers.map((a) => [a.questionId, a.value]));
    const snapByName = new Map(snap.categories.map((c) => [c.name, c]));
    const items: ReconstructItem[] = [];

    for (const cat of cats) {
      const snapCat = snapByName.get(cat.name);
      if (!snapCat) continue;

      let survivingScore = 0;
      let survivingMax = 0;
      const missing: typeof cat.questions = [];
      for (const q of cat.questions) {
        const maxValue = q.options.reduce((m, o) => Math.max(m, o.value), 0);
        if (valueByQ.has(q.id)) {
          survivingScore += (valueByQ.get(q.id) as number) * q.weight;
          survivingMax += maxValue * q.weight;
        } else {
          missing.push(q);
        }
      }
      if (missing.length === 0) continue;
      if (missing.length > 1) {
        ambiguous += 1;
        continue;
      }

      const q = missing[0]!;
      const maxValue = q.options.reduce((m, o) => Math.max(m, o.value), 0);
      const qMax = maxValue * q.weight;
      const missingMaxInSnap = round2(snapCat.max - survivingMax);
      // Only reconstruct if the snapshot max confirms THIS question was answered
      // at completion (its max contribution is present). Otherwise it was a
      // genuinely-skipped optional question — leave it alone.
      if (Math.abs(missingMaxInSnap - qMax) > EPS) continue;

      const missingContribution = round2(snapCat.score - survivingScore);
      const value = q.weight !== 0 ? missingContribution / q.weight : missingContribution;
      const vInt = Math.round(value);
      if (Math.abs(value - vInt) > EPS || vInt < 0) {
        unresolvable += 1;
        continue;
      }
      const opt = q.options.find((o) => o.value === vInt);
      if (!opt) {
        unresolvable += 1;
        continue;
      }

      creates.push({ submissionId: s.id, questionId: q.id, optionId: opt.id, value: vInt });
      items.push({ category: cat.name, question: q.text, value: vInt });
      reconstructed += 1;
    }

    if (items.length > 0) {
      affectedSubmissions += 1;
      if (samples.length < 10) samples.push({ customerId: s.customerId, items });
    }
  }

  if (apply && creates.length > 0) {
    // skipDuplicates guards the @@unique([submissionId, questionId]).
    await prisma.submissionAnswer.createMany({ data: creates, skipDuplicates: true });
  }

  return {
    ok: true,
    data: { applied: apply, scanned: subs.length, reconstructed, affectedSubmissions, ambiguous, unresolvable, samples },
  };
}
