"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
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
export interface RecomputeSummary {
  applied: boolean;
  /** Completed submissions scanned. */
  scanned: number;
  /** Submissions where at least one category band/meaning changed. */
  changedSubmissions: number;
  /** Total per-category cells (band or meaning) that changed. */
  changedCells: number;
  /** First few changed submissions, for a sanity preview. */
  samples: { customerId: string | null; changes: BandChange[] }[];
}

/**
 * Re-apply the assessment's CURRENT per-category bands to every completed
 * submission, using each contact's already-stored category score/max. Only the
 * snapshot's per-category band LABEL + MEANING change; scores, the overall band,
 * and AI messages are left untouched. Idempotent (safe to re-run). `apply=false`
 * is a dry run (no writes) that returns exactly what would change.
 */
export async function recomputeCategoryBands(
  assessmentId: string,
  apply: boolean,
): Promise<ActionResult<RecomputeSummary>> {
  await requireSuperAdmin();

  const cats = await prisma.category.findMany({
    where: { assessmentId },
    select: {
      name: true,
      bands: {
        select: { id: true, label: true, meaning: true, minScore: true, maxScore: true, displayOrder: true },
      },
    },
  });
  if (cats.length === 0) return { ok: false, error: "No categories found for this assessment." };
  const bandsByName = new Map<string, CategoryBandLike[]>(cats.map((c) => [c.name, c.bands]));

  const subs = await prisma.submission.findMany({
    where: { assessmentId, status: "COMPLETED" },
    select: { id: true, customerId: true, resultSnapshot: true },
  });

  let changedSubmissions = 0;
  let changedCells = 0;
  const samples: RecomputeSummary["samples"] = [];
  const updates: { id: string; snapshot: ResultSnapshot }[] = [];

  for (const s of subs) {
    const snap = (s.resultSnapshot ?? null) as ResultSnapshot | null;
    if (!snap || !Array.isArray(snap.categories)) continue;

    const changes: BandChange[] = [];
    const newCategories = snap.categories.map((c) => {
      const bands = bandsByName.get(c.name);
      if (!bands || bands.length === 0) return c;
      const e = mapCategoryResult(c.name, c.score, c.max, bands);
      if (e.band !== c.band || e.meaning !== c.meaning) {
        changes.push({ category: c.name, from: c.band, to: e.band });
      }
      return { ...c, band: e.band, meaning: e.meaning };
    });

    if (changes.length > 0) {
      changedSubmissions += 1;
      changedCells += changes.length;
      if (samples.length < 10) samples.push({ customerId: s.customerId, changes });
      updates.push({ id: s.id, snapshot: { ...snap, categories: newCategories } });
    }
  }

  if (apply && updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.submission.update({
          where: { id: u.id },
          data: { resultSnapshot: u.snapshot as unknown as Prisma.InputJsonValue },
        }),
      ),
    );
  }

  return {
    ok: true,
    data: { applied: apply, scanned: subs.length, changedSubmissions, changedCells, samples },
  };
}
