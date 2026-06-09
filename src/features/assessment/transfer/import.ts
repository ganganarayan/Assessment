import "server-only";
import { prisma } from "@/lib/db/prisma";
import { parseCsv } from "./csv";
import {
  assessmentExportSchema,
  EXPORT_SCHEMA_VERSION,
  type AssessmentExport,
  type ImportMode,
} from "./schema";

export type ParseResult =
  | { ok: true; data: AssessmentExport }
  | { ok: false; errors: string[] };

/** Parse + validate an uploaded export (JSON authoritative; CSV best-effort). */
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
    // Surface a clear version error first if that's the cause.
    const versionIssue = parsed.error.issues.find((i) =>
      i.path.includes("schemaVersion"),
    );
    if (versionIssue) {
      return {
        ok: false,
        errors: [
          `Unsupported schemaVersion. This server supports version ${EXPORT_SCHEMA_VERSION}.`,
        ],
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

/** Reconstruct an export object from the flat CSV format. */
function buildExportFromCsv(
  raw: string,
): { ok: true; value: unknown } | { ok: false; errors: string[] } {
  const rows = parseCsv(raw);
  if (rows.length < 2) return { ok: false, errors: ["CSV has no data rows."] };

  const header = rows[0] ?? [];
  const idx = (name: string) => header.indexOf(name);
  const need = ["row_type", "title", "slug"];
  for (const col of need) {
    if (idx(col) === -1) {
      return { ok: false, errors: [`CSV is missing required column "${col}".`] };
    }
  }

  const get = (row: string[], name: string): string => {
    const i = idx(name);
    return i === -1 ? "" : (row[i] ?? "").trim();
  };

  let title = "";
  let slug = "";

  // Preserve insertion order of categories and questions.
  const categories = new Map<
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
  >();
  const bands: AssessmentExport["assessment"]["resultBands"] = [];

  for (const row of rows.slice(1)) {
    const type = get(row, "row_type");
    if (!title) title = get(row, "title");
    if (!slug) slug = get(row, "slug");

    if (type === "QUESTION_OPTION") {
      const catName = get(row, "category");
      const catOrder = Number(get(row, "category_order")) || 0;
      const qText = get(row, "question");
      let cat = categories.get(catName);
      if (!cat) {
        cat = { name: catName, order: catOrder, questions: new Map() };
        categories.set(catName, cat);
      }
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
      const level = get(row, "band_level").toUpperCase();
      bands.push({
        level: level as AssessmentExport["assessment"]["resultBands"][number]["level"],
        title: get(row, "band_title"),
        description: get(row, "band_description") || null,
        minScore: Number(get(row, "band_min")) || 0,
        maxScore: Number(get(row, "band_max")) || 0,
        displayOrder: Number(get(row, "band_order")) || bands.length,
      });
    }
  }

  // CSV cannot carry lead-capture config / meta — apply sensible defaults.
  const value = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    assessment: {
      title,
      slug,
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
      categories: Array.from(categories.values())
        .sort((a, b) => a.order - b.order)
        .map((c, ci) => ({
          name: c.name,
          description: null,
          displayOrder: ci,
          questions: Array.from(c.questions.values())
            .sort((a, b) => a.order - b.order)
            .map((q, qi) => ({
              text: q.text,
              type: "SINGLE_SELECT",
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
      resultBands: bands.map((b, bi) => ({ ...b, displayOrder: bi })),
    },
  };
  return { ok: true, value };
}

export async function slugExists(slug: string): Promise<boolean> {
  const found = await prisma.assessment.findUnique({
    where: { slug },
    select: { id: true },
  });
  return found !== null;
}

/** Find an unused "<slug>-copy[-n]" slug. */
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

/**
 * Create the assessment + full tree in a SINGLE transaction. Any failure rolls
 * the whole import back — no partial imports. For "replace", the existing
 * assessment with the target slug (and its children + submissions, via cascade)
 * is deleted first inside the same transaction.
 */
export async function performImport(
  data: AssessmentExport,
  mode: ImportMode,
  finalSlug: string,
  userId: string | null,
): Promise<{ id: string; slug: string }> {
  const a = data.assessment;

  return prisma.$transaction(async (tx) => {
    if (mode === "replace") {
      await tx.assessment.deleteMany({ where: { slug: finalSlug } });
    }

    const created = await tx.assessment.create({
      data: {
        title: a.title,
        slug: finalSlug,
        description: a.description ?? null,
        coverImageUrl: a.coverImageUrl ?? null,
        estimatedMinutes: a.estimatedMinutes ?? null,
        thankYouMessage: a.thankYouMessage ?? null,
        collectFirstName: a.collectFirstName,
        firstNameRequired: a.firstNameRequired,
        collectLastName: a.collectLastName,
        lastNameRequired: a.lastNameRequired,
        collectEmail: a.collectEmail,
        emailRequired: a.emailRequired,
        collectMobile: a.collectMobile,
        mobileRequired: a.mobileRequired,
        status: "DRAFT",
        createdById: userId,
        categories: {
          create: a.categories.map((c, ci) => ({
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
                  create: q.options.map((o, oi) => ({
                    label: o.label,
                    value: o.value,
                    displayOrder: oi,
                  })),
                },
              })),
            },
          })),
        },
        resultBands: {
          create: a.resultBands.map((b, bi) => ({
            level: b.level,
            title: b.title,
            description: b.description ?? null,
            minScore: b.minScore,
            maxScore: b.maxScore,
            displayOrder: bi,
          })),
        },
      },
      select: { id: true, slug: true },
    });

    return created;
  });
}
