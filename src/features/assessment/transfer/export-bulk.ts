import "server-only";
import { prisma } from "@/lib/db/prisma";
import { buildAssessmentExport } from "@/features/assessment/transfer/export";
import { EXPORT_SCHEMA_VERSION } from "@/features/assessment/transfer/schema";
import { toCsv } from "@/features/assessment/transfer/csv";

/** All assessments as one JSON document (lossless structure). */
export async function exportAllJson(exportedAt: string): Promise<string> {
  const ids = await prisma.assessment.findMany({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const assessments = [];
  for (const { id } of ids) {
    const e = await buildAssessmentExport(id, exportedAt);
    if (e) assessments.push(e.assessment);
  }
  return JSON.stringify(
    { schemaVersion: EXPORT_SCHEMA_VERSION, exportedAt, assessments },
    null,
    2,
  );
}

/** Flat structure CSV across all assessments (questions/options + bands). */
export async function exportAllStructureCsv(exportedAt: string): Promise<string> {
  const ids = await prisma.assessment.findMany({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  const header = [
    "assessment_slug",
    "assessment_title",
    "row_type",
    "category",
    "category_order",
    "question",
    "weight",
    "required",
    "question_order",
    "option_label",
    "option_value",
    "option_order",
    "band_level",
    "band_title",
    "band_min",
    "band_max",
    "band_order",
  ];
  const rows: (string | number | boolean | null)[][] = [header];

  for (const { id } of ids) {
    const e = await buildAssessmentExport(id, exportedAt);
    if (!e) continue;
    const a = e.assessment;
    for (const c of a.categories) {
      for (const q of c.questions) {
        for (const o of q.options) {
          rows.push([
            a.slug, a.title, "QUESTION_OPTION",
            c.name, c.displayOrder,
            q.text, q.weight, q.required, q.displayOrder,
            o.label, o.value, o.displayOrder,
            "", "", "", "", "",
          ]);
        }
      }
    }
    for (const b of a.resultBands) {
      rows.push([
        a.slug, a.title, "BAND",
        "", "", "", "", "", "", "", "", "",
        b.level, b.title, b.minScore, b.maxScore, b.displayOrder,
      ]);
    }
  }
  return toCsv(rows);
}

/** One row per completed submission: lead + category breakdown + total + band. */
export async function exportResponsesCsv(): Promise<string> {
  const submissions = await prisma.submission.findMany({
    where: { status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    select: {
      completedAt: true,
      createdAt: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      totalScore: true,
      maxScore: true,
      assessment: { select: { slug: true, title: true } },
      resultBand: { select: { level: true, title: true } },
      categoryScores: {
        select: { score: true, maxScore: true, category: { select: { name: true } } },
      },
    },
  });

  const header = [
    "date",
    "assessment",
    "first_name",
    "last_name",
    "email",
    "phone",
    "category_breakdown",
    "total_score",
    "max_score",
    "percentage",
    "band_level",
    "band_title",
  ];
  const rows: (string | number | null)[][] = [header];

  for (const s of submissions) {
    const total = s.totalScore ?? 0;
    const max = s.maxScore ?? 0;
    const pct = max > 0 ? Math.round((total / max) * 100) : 0;
    const breakdown = s.categoryScores
      .map((cs) => `${cs.category.name}=${cs.score}/${cs.maxScore}`)
      .join("; ");
    rows.push([
      (s.completedAt ?? s.createdAt).toISOString(),
      s.assessment.title,
      s.leadFirstName ?? "",
      s.leadLastName ?? "",
      s.leadEmail ?? "",
      s.leadMobile ?? "",
      breakdown,
      total,
      max,
      pct,
      s.resultBand?.level ?? "",
      s.resultBand?.title ?? "",
    ]);
  }
  return toCsv(rows);
}
