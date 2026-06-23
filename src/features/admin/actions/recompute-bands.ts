"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { pickResultBand } from "@/features/assessment/scoring";
import {
  mapCategoryResult,
  type ResultSnapshot,
  type CategoryBandLike,
} from "@/lib/result/snapshot";
import { type ActionResult } from "@/features/assessment/actions/shared";

export interface BandChange {
  category: string;
  from: string | null;
  to: string | null;
}
export interface OverallChange {
  from: string | null;
  to: string | null;
}
export interface RecomputeSummary {
  applied: boolean;
  /** Completed submissions scanned. */
  scanned: number;
  /** Submissions where the overall band and/or any category band changed. */
  changedSubmissions: number;
  /** Submissions where the OVERALL band changed. */
  overallChanges: number;
  /** Total per-category cells (band/meaning) that changed. */
  categoryCells: number;
  /** First few changed submissions, for a sanity preview. */
  samples: { customerId: string | null; overall: OverallChange | null; categories: BandChange[] }[];
}

/**
 * Re-apply the assessment's CURRENT bands (overall + per-category) to every
 * completed submission, using each contact's already-stored percentage / category
 * scores. Rewrites the snapshot's overall band (title/level/suggestion) + the
 * linked resultBandId, and each category's band label + meaning. Scores and AI
 * messages are left untouched. Idempotent (safe to re-run). `apply=false` is a
 * dry run (no writes) that returns exactly what would change.
 */
export async function recomputeBands(
  assessmentId: string,
  apply: boolean,
): Promise<ActionResult<RecomputeSummary>> {
  await requireSuperAdmin();

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: {
      resultBands: {
        select: { id: true, level: true, title: true, description: true, minScore: true, maxScore: true, displayOrder: true },
      },
      categories: {
        select: {
          name: true,
          bands: {
            select: { id: true, label: true, meaning: true, minScore: true, maxScore: true, displayOrder: true },
          },
        },
      },
    },
  });
  if (!assessment) return { ok: false, error: "Assessment not found." };
  const resultBands = assessment.resultBands;
  const bandsByName = new Map<string, CategoryBandLike[]>(
    assessment.categories.map((c) => [c.name, c.bands]),
  );

  const subs = await prisma.submission.findMany({
    where: { assessmentId, status: "COMPLETED" },
    select: { id: true, customerId: true, totalScore: true, maxScore: true, resultSnapshot: true },
  });

  let changedSubmissions = 0;
  let overallChanges = 0;
  let categoryCells = 0;
  const samples: RecomputeSummary["samples"] = [];
  const updates: { id: string; snapshot: ResultSnapshot; resultBandId: string | null }[] = [];

  for (const s of subs) {
    const snap = (s.resultSnapshot ?? null) as ResultSnapshot | null;
    if (!snap) continue;

    // Overall band from the stored percentage (the banding basis).
    const pct =
      typeof snap.scorePercent === "number"
        ? snap.scorePercent
        : s.maxScore && s.maxScore > 0
          ? Math.round(((s.totalScore ?? 0) / s.maxScore) * 100)
          : 0;
    const newOverall = resultBands.length ? pickResultBand(resultBands, pct) : null;
    const newTitle = newOverall?.title ?? null;
    const overallChanged =
      newTitle !== (snap.resultBand ?? null) ||
      (newOverall?.level ?? null) !== (snap.resultBandLevel ?? null) ||
      (newOverall?.description ?? null) !== (snap.resultSuggestion ?? null);

    // Per-category bands from each stored category score.
    const catChanges: BandChange[] = [];
    const newCategories = Array.isArray(snap.categories)
      ? snap.categories.map((c) => {
          const bands = bandsByName.get(c.name);
          if (!bands || bands.length === 0) return c;
          const e = mapCategoryResult(c.name, c.score, c.max, bands);
          if (e.band !== c.band || e.meaning !== c.meaning) {
            catChanges.push({ category: c.name, from: c.band, to: e.band });
          }
          return { ...c, band: e.band, meaning: e.meaning };
        })
      : snap.categories;

    if (!overallChanged && catChanges.length === 0) continue;

    changedSubmissions += 1;
    if (overallChanged) overallChanges += 1;
    categoryCells += catChanges.length;
    if (samples.length < 10) {
      samples.push({
        customerId: s.customerId,
        overall: overallChanged ? { from: snap.resultBand ?? null, to: newTitle } : null,
        categories: catChanges,
      });
    }

    const merged: ResultSnapshot = {
      ...snap,
      resultBand: newTitle,
      resultBandLevel: newOverall?.level ?? null,
      resultSuggestion: newOverall?.description ?? null,
      categories: newCategories,
    };
    updates.push({ id: s.id, snapshot: merged, resultBandId: newOverall?.id ?? null });
  }

  if (apply && updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.submission.update({
          where: { id: u.id },
          data: {
            resultSnapshot: u.snapshot as unknown as Prisma.InputJsonValue,
            resultBandId: u.resultBandId,
          },
        }),
      ),
    );
  }

  return {
    ok: true,
    data: { applied: apply, scanned: subs.length, changedSubmissions, overallChanges, categoryCells, samples },
  };
}
