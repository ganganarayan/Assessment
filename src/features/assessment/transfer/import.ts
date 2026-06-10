import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { parseCsv } from "./csv";
import {
  assessmentExportSchema,
  EXPORT_SCHEMA_VERSION,
  type AssessmentExport,
  type AssessmentBodyExport,
} from "./schema";

export type ParseResult =
  | { ok: true; data: AssessmentExport }
  | { ok: false; errors: string[] };

/** Parse + validate an uploaded export (one format: { assessments: [...] }). */
export function parseImportText(raw: string, format: "json" | "csv"): ParseResult {
  let candidate: unknown;
  if (format === "json") {
    try {
      candidate = JSON.parse(raw);
    } catch {
      return { ok: false, errors: ["File is not valid JSON."] };
    }
  } else {
    const built = buildExportFromCsv(raw);
    if (!built.ok) return built;
    candidate = built.value;
  }

  const parsed = assessmentExportSchema.safeParse(candidate);
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path.includes("schemaVersion"))) {
      return {
        ok: false,
        errors: [`Unsupported schemaVersion. This server supports version ${EXPORT_SCHEMA_VERSION}.`],
      };
    }
    return {
      ok: false,
      errors: parsed.error.issues
        .slice(0, 20)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  return { ok: true, data: parsed.data };
}

/** Reconstruct the export document from the flat CSV (grouped by assessment_slug). */
function buildExportFromCsv(
  raw: string,
): { ok: true; value: unknown } | { ok: false; errors: string[] } {
  const rows = parseCsv(raw);
  if (rows.length < 2) return { ok: false, errors: ["CSV has no data rows."] };

  const header = rows[0] ?? [];
  const idx = (name: string) => header.indexOf(name);
  for (const col of ["assessment_slug", "assessment_title", "row_type"]) {
    if (idx(col) === -1) {
      return { ok: false, errors: [`CSV is missing required column "${col}".`] };
    }
  }
  const get = (row: string[], name: string): string => {
    const i = idx(name);
    return i === -1 ? "" : (row[i] ?? "").trim();
  };

  interface Acc {
    title: string;
    slug: string;
    categories: Map<
      string,
      {
        name: string;
        order: number;
        questions: Map<
          string,
          {
            text: string;
            weight: number;
            required: boolean;
            order: number;
            options: { label: string; value: number; displayOrder: number }[];
          }
        >;
      }
    >;
    bands: AssessmentBodyExport["resultBands"];
  }
  const assessments = new Map<string, Acc>();
  const getAcc = (slug: string, title: string): Acc => {
    let a = assessments.get(slug);
    if (!a) {
      a = { title, slug, categories: new Map(), bands: [] };
      assessments.set(slug, a);
    }
    return a;
  };

  for (const row of rows.slice(1)) {
    const slug = get(row, "assessment_slug");
    if (!slug) continue;
    const acc = getAcc(slug, get(row, "assessment_title"));
    const type = get(row, "row_type");

    if (type === "QUESTION_OPTION") {
      const catName = get(row, "category");
      let cat = acc.categories.get(catName);
      if (!cat) {
        cat = { name: catName, order: Number(get(row, "category_order")) || 0, questions: new Map() };
        acc.categories.set(catName, cat);
      }
      const qText = get(row, "question");
      let q = cat.questions.get(qText);
      if (!q) {
        q = {
          text: qText,
          weight: Number(get(row, "weight")) || 0,
          required: get(row, "required").toLowerCase() === "true",
          order: Number(get(row, "question_order")) || 0,
          options: [],
        };
        cat.questions.set(qText, q);
      }
      q.options.push({
        label: get(row, "option_label"),
        value: Number(get(row, "option_value")) || 0,
        displayOrder: Number(get(row, "option_order")) || q.options.length,
      });
    } else if (type === "BAND") {
      acc.bands.push({
        level: get(row, "band_level").toUpperCase() as AssessmentBodyExport["resultBands"][number]["level"],
        title: get(row, "band_title"),
        description: get(row, "band_description") || null,
        minScore: Number(get(row, "band_min")) || 0,
        maxScore: Number(get(row, "band_max")) || 0,
        displayOrder: acc.bands.length,
      });
    }
  }

  const bodies = Array.from(assessments.values()).map((a) => ({
    title: a.title,
    slug: a.slug,
    description: null,
    coverImageUrl: null,
    estimatedMinutes: null,
    thankYouMessage: null,
    collectFirstName: true,
    firstNameRequired: false,
    collectLastName: true,
    lastNameRequired: false,
    collectEmail: true,
    emailRequired: true,
    collectMobile: true,
    mobileRequired: false,
    categories: Array.from(a.categories.values())
      .sort((x, y) => x.order - y.order)
      .map((c, ci) => ({
        name: c.name,
        description: null,
        displayOrder: ci,
        questions: Array.from(c.questions.values())
          .sort((x, y) => x.order - y.order)
          .map((q, qi) => ({
            text: q.text,
            type: "SINGLE_SELECT",
            weight: q.weight,
            required: q.required,
            displayOrder: qi,
            options: q.options.map((o, oi) => ({ label: o.label, value: o.value, displayOrder: oi })),
          })),
      })),
    resultBands: a.bands.map((b, bi) => ({ ...b, displayOrder: bi })),
  }));

  return { ok: true, value: { schemaVersion: EXPORT_SCHEMA_VERSION, assessments: bodies } };
}

export async function slugExists(slug: string): Promise<boolean> {
  return (await prisma.assessment.findUnique({ where: { slug }, select: { id: true } })) !== null;
}

export async function generateCopySlug(base: string): Promise<string> {
  let candidate = `${base}-copy`;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await slugExists(candidate)) {
    n += 1;
    candidate = `${base}-copy-${n}`;
  }
  return candidate;
}

function createData(
  body: AssessmentBodyExport,
  finalSlug: string,
  userId: string | null,
): Prisma.AssessmentCreateInput {
  return {
    title: body.title,
    slug: finalSlug,
    description: body.description ?? null,
    coverImageUrl: body.coverImageUrl ?? null,
    estimatedMinutes: body.estimatedMinutes ?? null,
    thankYouMessage: body.thankYouMessage ?? null,
    collectFirstName: body.collectFirstName,
    firstNameRequired: body.firstNameRequired,
    collectLastName: body.collectLastName,
    lastNameRequired: body.lastNameRequired,
    collectEmail: body.collectEmail,
    emailRequired: body.emailRequired,
    collectMobile: body.collectMobile,
    mobileRequired: body.mobileRequired,
    status: "DRAFT",
    ...(userId ? { createdBy: { connect: { id: userId } } } : {}),
    categories: {
      create: body.categories.map((c, ci) => ({
        name: c.name,
        description: c.description ?? null,
        displayOrder: ci,
        questions: {
          create: c.questions.map((q, qi) => ({
            text: q.text,
            weight: q.weight,
            required: q.required,
            displayOrder: qi,
            options: {
              create: q.options.map((o, oi) => ({ label: o.label, value: o.value, displayOrder: oi })),
            },
          })),
        },
      })),
    },
    resultBands: {
      create: body.resultBands.map((b, bi) => ({
        level: b.level,
        title: b.title,
        description: b.description ?? null,
        minScore: b.minScore,
        maxScore: b.maxScore,
        displayOrder: bi,
      })),
    },
  };
}

export interface ImportItem {
  body: AssessmentBodyExport;
  finalSlug: string;
  replace: boolean;
}

/**
 * Import all assessments in ONE transaction — any failure rolls everything back
 * (no partial imports). For replace, the existing slug is deleted first.
 */
export async function performImportAll(
  items: ImportItem[],
  userId: string | null,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    for (const item of items) {
      if (item.replace) {
        await tx.assessment.deleteMany({ where: { slug: item.finalSlug } });
      }
      await tx.assessment.create({ data: createData(item.body, item.finalSlug, userId) });
    }
    return items.length;
  });
}
