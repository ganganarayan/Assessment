"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin, assertCanEditOrThrow } from "@/lib/auth/guards";
import { generatePersonalStatement } from "@/lib/ai/generate";
import { getSubmissionQuestionBreakdown } from "@/features/admin/data/submission-questions";
import { type StatementInput } from "@/lib/ai/types";
import { type ResultSnapshot } from "@/lib/result/snapshot";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { floorCreatedAt } from "@/lib/stats-floor";

/** Per-round result for the client-driven progress loop. */
export interface AiRerunBatchResult {
  total: number;
  scanned: number;
  succeeded: number;
  failed: number;
  done: boolean;
  nextOffset: number;
}

/** Number of statements generated per round (in parallel). Kept modest so each
 *  round stays well under any request timeout and we don't hammer the LLM. */
const BATCH = 5;

/**
 * The saved reporting-start floor for this assessment (Assessment.statsResetAt),
 * as a `createdAt` where-fragment. Every count and the re-run itself apply this so
 * the numbers match the Submissions page and we never touch pre-window contacts.
 * Module-local (not exported) — this "use server" file exports only async actions.
 */
async function assessmentFloor(assessmentId: string): Promise<Record<string, unknown>> {
  const a = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { statsResetAt: true },
  });
  return floorCreatedAt(a?.statsResetAt ?? null);
}

/**
 * Completions + total submissions for the selected assessment, both scoped to the
 * assessment's saved reporting-start date. `completions` is exactly what the re-run
 * will process (the rest have no score snapshot). Drives the auto-loaded readout.
 */
export async function aiRerunCount(
  assessmentId: string,
): Promise<ActionResult<{ completions: number; submissions: number }>> {
  await requireSuperAdmin();
  const floor = await assessmentFloor(assessmentId);
  const [completions, submissions] = await Promise.all([
    prisma.submission.count({ where: { assessmentId, status: "COMPLETED", ...floor } }),
    prisma.submission.count({ where: { assessmentId, ...floor } }),
  ]);
  return { ok: true, data: { completions, submissions } };
}

export interface AiSample {
  customerId: string | null;
  firstName: string | null;
  profession: string | null;
  scorePercent: number;
  band: string | null;
  text: string | null;
}

/**
 * Generate sample statements for a few REAL contacts spanning different overall
 * bands, using the current bands + active prompt — WITHOUT saving anything (no
 * version created, no default changed, nothing dirtied). Lets the owner judge the
 * prompt on real data and tweak it before committing to the full (billable) run.
 */
export async function previewAiSamples(
  assessmentId: string,
  count = 4,
): Promise<ActionResult<{ samples: AiSample[] }>> {
  assertCanEditOrThrow(await requireSuperAdmin());

  const floor = await assessmentFloor(assessmentId);
  const subs = await prisma.submission.findMany({
    where: { assessmentId, status: "COMPLETED", ...floor },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: {
      id: true,
      customerId: true,
      leadFirstName: true,
      leadProfession: true,
      resultSnapshot: true,
      assessment: { select: { title: true } },
    },
  });

  // Pick a spread: one contact per distinct PROFESSION first (so the
  // profession-driven difference is visible), then fill with the rest.
  const picked: typeof subs = [];
  const seenProf = new Set<string>();
  for (const s of subs) {
    if (!s.resultSnapshot) continue;
    const prof = s.leadProfession ?? "(none)";
    if (seenProf.has(prof)) continue;
    seenProf.add(prof);
    picked.push(s);
    if (picked.length >= count) break;
  }
  if (picked.length < count) {
    for (const s of subs) {
      if (picked.some((p) => p.id === s.id)) continue;
      if (!s.resultSnapshot) continue;
      picked.push(s);
      if (picked.length >= count) break;
    }
  }

  const samples = await Promise.all(
    picked.map(async (s): Promise<AiSample> => {
      const snap = s.resultSnapshot as unknown as ResultSnapshot;
      const breakdown = await getSubmissionQuestionBreakdown(s.id);
      const qByCat = new Map(breakdown.map((b) => [b.name, b.questions]));
      const input: StatementInput = {
        firstName: s.leadFirstName,
        profession: s.leadProfession,
        assessmentTitle: s.assessment.title,
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
          questions: qByCat.get(c.name) ?? [],
        })),
      };
      const text = await generatePersonalStatement(input);
      return {
        customerId: s.customerId,
        firstName: s.leadFirstName,
        profession: s.leadProfession,
        scorePercent: snap.scorePercent,
        band: snap.resultBand,
        text,
      };
    }),
  );

  return { ok: true, data: { samples } };
}

/**
 * Regenerate the AI statement for one round (BATCH submissions, in parallel),
 * starting at `offset`. Each new message is written as that contact's DEFAULT
 * version (old versions kept) and mirrored into the snapshot so the VSL serves
 * it. Uses the CURRENT bands (from the snapshot) + the active prompt version.
 *
 * Ordered oldest-first so a live completion mid-run appends at the end and never
 * shifts an already-processed contact. The client calls this repeatedly with the
 * returned nextOffset until `done`.
 */
export async function regenerateAiBatch(
  assessmentId: string,
  offset: number,
): Promise<ActionResult<AiRerunBatchResult>> {
  assertCanEditOrThrow(await requireSuperAdmin());

  const floor = await assessmentFloor(assessmentId);
  const where = { assessmentId, status: "COMPLETED" as const, ...floor };
  const total = await prisma.submission.count({ where });
  const subs = await prisma.submission.findMany({
    where,
    orderBy: { createdAt: "asc" },
    skip: Math.max(0, offset),
    take: BATCH,
    select: {
      id: true,
      leadFirstName: true,
      leadProfession: true,
      resultSnapshot: true,
      assessment: { select: { title: true } },
    },
  });

  let succeeded = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (s) => {
      const snap = (s.resultSnapshot ?? null) as ResultSnapshot | null;
      if (!snap || typeof snap.scoreRaw !== "number" || !Array.isArray(snap.categories)) {
        failed += 1;
        return;
      }
      const breakdown = await getSubmissionQuestionBreakdown(s.id);
      const qByCat = new Map(breakdown.map((b) => [b.name, b.questions]));
      const input: StatementInput = {
        firstName: s.leadFirstName,
        profession: s.leadProfession,
        assessmentTitle: s.assessment.title,
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
          questions: qByCat.get(c.name) ?? [],
        })),
      };

      const text = await generatePersonalStatement(input);
      if (!text) {
        failed += 1;
        return;
      }
      try {
        await prisma.$transaction(async (tx) => {
          await tx.aiStatement.updateMany({ where: { submissionId: s.id }, data: { isDefault: false } });
          await tx.aiStatement.create({
            data: { submissionId: s.id, text, source: "ai", isDefault: true },
          });
          const merged: ResultSnapshot = { ...snap, aiStatement: text };
          await tx.submission.update({
            where: { id: s.id },
            data: {
              aiStatement: text,
              resultSnapshot: merged as unknown as Prisma.InputJsonValue,
              crmDirty: true, // AI message changed -> queue for CRM resend
            },
          });
        });
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }),
  );

  const nextOffset = offset + subs.length;
  return {
    ok: true,
    data: {
      total,
      scanned: subs.length,
      succeeded,
      failed,
      done: subs.length === 0 || nextOffset >= total,
      nextOffset,
    },
  };
}
