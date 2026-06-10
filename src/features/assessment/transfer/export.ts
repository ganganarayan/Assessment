import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  EXPORT_SCHEMA_VERSION,
  type AssessmentBodyExport,
} from "./schema";
import { toCsv } from "./csv";

/**
 * Build the portable body for one assessment (ids/tenant/submissions stripped;
 * displayOrder renumbered). Returns null if it doesn't exist.
 */
async function buildAssessmentBody(
  id: string,
): Promise<AssessmentBodyExport | null> {
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
  };
}

async function buildBodies(ids: string[]): Promise<AssessmentBodyExport[]> {
  const out: AssessmentBodyExport[] = [];
  for (const id of ids) {
    const b = await buildAssessmentBody(id);
    if (b) out.push(b);
  }
  return out;
}

/** THE JSON export (one assessment or many — same shape). */
export async function buildExportJson(
  ids: string[],
  exportedAt: string,
): Promise<string> {
  const assessments = await buildBodies(ids);
  return JSON.stringify(
    { schemaVersion: EXPORT_SCHEMA_VERSION, exportedAt, assessments },
    null,
    2,
  );
}

const CSV_HEADER = [
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
  "band_description",
  "band_min",
  "band_max",
  "band_order",
];

/** THE CSV export — same flat schema for one assessment or many. */
export async function buildExportCsv(ids: string[]): Promise<string> {
  const bodies = await buildBodies(ids);
  const rows: (string | number | boolean | null)[][] = [CSV_HEADER];

  for (const a of bodies) {
    a.categories.forEach((c) => {
      c.questions.forEach((q) => {
        q.options.forEach((o) => {
          rows.push([
            a.slug, a.title, "QUESTION_OPTION",
            c.name, c.displayOrder,
            q.text, q.weight, q.required, q.displayOrder,
            o.label, o.value, o.displayOrder,
            "", "", "", "", "", "",
          ]);
        });
      });
    });
    a.resultBands.forEach((b) => {
      rows.push([
        a.slug, a.title, "BAND",
        "", "", "", "", "", "", "", "", "",
        b.level, b.title, b.description ?? "", b.minScore, b.maxScore, b.displayOrder,
      ]);
    });
  }
  return toCsv(rows);
}

export function exportFilename(stem: string, ext: "json" | "csv"): string {
  const safe = stem.replace(/[^a-z0-9-]/gi, "-");
  return `${safe}.${ext}`;
}
