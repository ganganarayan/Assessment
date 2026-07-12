"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { generatePersonalStatementResult } from "@/lib/ai/generate";
import { type StatementInput } from "@/lib/ai/types";
import { type ResultSnapshot } from "@/lib/result/snapshot";
import { getSubmissionQuestionBreakdown } from "@/features/admin/data/submission-questions";
import { type ActionResult } from "@/features/assessment/actions/shared";

/** One versioned message for a submission (for the result-page manager). */
export interface AiStatementRow {
  id: string;
  text: string;
  source: string; // "ai" | "manual"
  instruction: string | null;
  isDefault: boolean;
  createdAt: string;
}

const MAX_LEN = 6000;

function revalidate(slug: string, submissionId: string) {
  revalidatePath(`/a/${slug}/r/${submissionId}`);
}

/** Ask AI: build the model input from the stored snapshot + the editor's
 *  correction, generate a new version (not default). */
export async function regenerateAiStatement(
  slug: string,
  submissionId: string,
  instruction: string,
): Promise<ActionResult> {
  await requireSuperAdmin();
  const instr = (instruction ?? "").trim();
  if (instr.length > 2000) return { ok: false, error: "Instruction is too long (max 2000 characters)." };

  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      leadFirstName: true,
      leadProfession: true,
      resultSnapshot: true,
      assessment: { select: { title: true } },
    },
  });
  const snap = (sub?.resultSnapshot ?? null) as ResultSnapshot | null;
  if (!sub || !snap || typeof snap.scoreRaw !== "number" || !Array.isArray(snap.categories)) {
    return { ok: false, error: "This submission has no usable result yet." };
  }

  // Pull the per-question detail (text + chosen answer + score) live from the
  // stored answers so a regenerate gets the same MEANING signal as completion.
  const breakdown = await getSubmissionQuestionBreakdown(submissionId);
  const questionsByCategory = new Map(breakdown.map((b) => [b.name, b.questions]));

  const input: StatementInput = {
    firstName: sub.leadFirstName,
    profession: sub.leadProfession,
    assessmentTitle: sub.assessment.title,
    scoreRaw: snap.scoreRaw,
    max: snap.max,
    percentage: snap.scorePercent,
    band: snap.resultBand,
    bandLevel: snap.resultBandLevel ?? null,
    categories: snap.categories.map((c) => ({
      name: c.name,
      score: c.score,
      max: c.max,
      band: c.band,
      meaning: c.meaning,
      questions: questionsByCategory.get(c.name) ?? [],
    })),
    instruction: instr || null,
  };

  const { text, error } = await generatePersonalStatementResult(input);
  if (!text) {
    return { ok: false, error: error ?? "The AI returned nothing. Make sure AI is enabled with a valid key." };
  }
  await prisma.aiStatement.create({
    data: { submissionId, text, source: "ai", instruction: instr || null, isDefault: false },
  });
  revalidate(slug, submissionId);
  return { ok: true };
}

/** Write my own: save an admin-written message as a new version (not default). */
export async function saveManualAiStatement(
  slug: string,
  submissionId: string,
  text: string,
): Promise<ActionResult> {
  await requireSuperAdmin();
  const t = (text ?? "").trim();
  if (!t) return { ok: false, error: "Write the message first." };
  if (t.length > MAX_LEN) return { ok: false, error: "Message is too long." };
  await prisma.aiStatement.create({
    data: { submissionId, text: t, source: "manual", isDefault: false },
  });
  revalidate(slug, submissionId);
  return { ok: true };
}

/** Make one version the default — it is mirrored into the snapshot so the VSL
 *  serves it on the next load. */
export async function setDefaultAiStatement(
  slug: string,
  submissionId: string,
  statementId: string,
): Promise<ActionResult> {
  await requireSuperAdmin();
  const st = await prisma.aiStatement.findUnique({
    where: { id: statementId },
    select: { submissionId: true, text: true },
  });
  if (!st || st.submissionId !== submissionId) return { ok: false, error: "Version not found." };

  await prisma.$transaction(async (tx) => {
    await tx.aiStatement.updateMany({ where: { submissionId }, data: { isDefault: false } });
    await tx.aiStatement.update({ where: { id: statementId }, data: { isDefault: true } });

    const sub = await tx.submission.findUnique({
      where: { id: submissionId },
      select: { resultSnapshot: true },
    });
    const snap = (sub?.resultSnapshot ?? null) as ResultSnapshot | null;
    const data: Prisma.SubmissionUpdateInput = { aiStatement: st.text };
    if (snap) {
      // Build a fresh object (don't mutate the read) so only aiStatement changes.
      const merged: ResultSnapshot = { ...snap, aiStatement: st.text };
      data.resultSnapshot = merged as unknown as Prisma.InputJsonValue;
    }
    await tx.submission.update({ where: { id: submissionId }, data });
  });

  revalidate(slug, submissionId);
  return { ok: true };
}

/** Delete selected versions. The current default is never deleted. */
export async function deleteAiStatements(
  slug: string,
  submissionId: string,
  ids: string[],
): Promise<ActionResult> {
  await requireSuperAdmin();
  if (!ids.length) return { ok: true };
  await prisma.aiStatement.deleteMany({
    where: { id: { in: ids }, submissionId, isDefault: false },
  });
  revalidate(slug, submissionId);
  return { ok: true };
}
