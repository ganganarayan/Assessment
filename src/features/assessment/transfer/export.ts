import "server-only";
import { prisma } from "@/lib/db/prisma";
import { EXPORT_SCHEMA_VERSION, type AssessmentExport } from "./schema";
import { toCsv } from "./csv";

/**
 * Build the portable, lossless export object for an assessment.
 * Strips ids/tenant/owner/submissions/timestamps; renumbers displayOrder to a
 * clean 0..n sequence. Returns null if the assessment does not exist.
 */
export async function buildAssessmentExport(
  id: string,
  exportedAt: string,
): Promise<AssessmentExport | null> {
  const a = await prisma.assessment.findUnique({
    where: { id },
    include: {
      categories: {
        orderBy: { displayOrder: "asc" },
        include: {
          questions: {
            orderBy: { displayOrder: "asc" },
            include: { options: { orderBy: { displayOrder: "asc" } } },
          },
        },
      },
      resultBands: { orderBy: { displayOrder: "asc" } },
    },
  });
  if (!a) return null;

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt,
    assessment: {
      title: a.title,
      slug: a.slug,
      description: a.description,
      coverImageUrl: a.coverImageUrl,
      estimatedMinutes: a.estimatedMinutes,
      thankYouMessage: a.thankYouMessage,
      collectFirstName: a.collectFirstName,
      firstNameRequired: a.firstNameRequired,
      collectLastName: a.collectLastName,
      lastNameRequired: a.lastNameRequired,
      collectEmail: a.collectEmail,
      emailRequired: a.emailRequired,
      collectMobile: a.collectMobile,
      mobileRequired: a.mobileRequired,
      categories: a.categories.map((c, ci) => ({
        name: c.name,
        description: c.description,
        displayOrder: ci,
        questions: c.questions.map((q, qi) => ({
          text: q.text,
          type: "SINGLE_SELECT" as const,
          weight: q.weight,
          required: q.required,
          displayOrder: qi,
          options: q.options.map((o, oi) => ({
            label: o.label,
            value: o.value,
            displayOrder: oi,
          })),
        })),
      })),
      resultBands: a.resultBands.map((b, bi) => ({
        level: b.level,
        title: b.title,
        description: b.description,
        minScore: b.minScore,
        maxScore: b.maxScore,
        displayOrder: bi,
      })),
    },
  };
}

const CSV_HEADER = [
  "row_type",
  "title",
  "slug",
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
  "band_description",
  "band_min",
  "band_max",
  "band_order",
];

/**
 * Flat CSV for backup/reporting. Reconstructs structure (categories, questions,
 * options, result bands) on import; assessment-level lead-capture config and
 * meta (description/cover/etc.) are NOT represented and default on CSV import —
 * use JSON for an exact, lossless copy.
 */
export function exportToCsv(data: AssessmentExport): string {
  const { assessment: a } = data;
  const rows: (string | number | boolean | null)[][] = [CSV_HEADER];

  a.categories.forEach((c) => {
    c.questions.forEach((q) => {
      q.options.forEach((o) => {
        rows.push([
          "QUESTION_OPTION",
          a.title,
          a.slug,
          c.name,
          c.displayOrder,
          q.text,
          q.weight,
          q.required,
          q.displayOrder,
          o.label,
          o.value,
          o.displayOrder,
          "",
          "",
          "",
          "",
          "",
          "",
        ]);
      });
    });
  });

  a.resultBands.forEach((b) => {
    rows.push([
      "BAND",
      a.title,
      a.slug,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      b.level,
      b.title,
      b.description ?? "",
      b.minScore,
      b.maxScore,
      b.displayOrder,
    ]);
  });

  return toCsv(rows);
}

/** Safe filename stem from the slug. */
export function exportFilename(slug: string, ext: "json" | "csv"): string {
  const safe = slug.replace(/[^a-z0-9-]/gi, "-");
  return `assessment-${safe}.${ext}`;
}
