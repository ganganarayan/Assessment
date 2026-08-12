/**
 * Pure (no DB, no server-only) serialize/parse for the assessment transfer
 * format. Both the JSON and CSV exports produce — and the importer accepts —
 * exactly these shapes, so anything exported re-imports cleanly (round-trip).
 *
 * Keep this module dependency-free (only schema + csv) so it can be unit-tested
 * directly: see scripts/verify-transfer.ts.
 */
import { toCsv, parseCsv } from "./csv";
import {
  assessmentExportSchema,
  EXPORT_SCHEMA_VERSION,
  type AssessmentExport,
  type AssessmentBodyExport,
} from "./schema";

export type ParseResult =
  | { ok: true; data: AssessmentExport }
  | { ok: false; errors: string[] };

/* ------------------------------------------------------------------ JSON --- */

/** THE JSON document: { schemaVersion, exportedAt?, assessments: [...] }. */
export function bodiesToJson(
  bodies: AssessmentBodyExport[],
  exportedAt?: string,
): string {
  return JSON.stringify(
    {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      ...(exportedAt ? { exportedAt } : {}),
      assessments: bodies,
    },
    null,
    2,
  );
}

/* ------------------------------------------------------------------- CSV --- */

/**
 * Lossless CSV layout. One flat file, rows discriminated by `row_type`
 * (ASSESSMENT / CATEGORY / QUESTION / OPTION / BAND) and grouped by
 * `assessment_slug`. Structure is positional via `*_index` columns — never by
 * display text — so duplicate category names / question text, empty categories,
 * and option-less questions all round-trip exactly like the JSON path.
 */
export const CSV_COLUMNS = [
  "assessment_slug",
  "row_type",
  "assessment_title",
  "description",
  "cover_image_url",
  "estimated_minutes",
  "thank_you_message",
  "collect_first_name",
  "first_name_required",
  "collect_last_name",
  "last_name_required",
  "collect_email",
  "email_required",
  "collect_mobile",
  "mobile_required",
  "collect_profession",
  "profession_required",
  "engine",
  "category_index",
  "category_name",
  "category_description",
  "category_page",
  "question_index",
  "question_text",
  "weight",
  "required",
  "question_scoring_role",
  "option_index",
  "option_label",
  "option_value",
  "option_diagnosis_clause",
  "option_is_assumption",
  "band_index",
  "band_level",
  "band_title",
  "band_description",
  "band_min",
  "band_max",
] as const;

type Col = (typeof CSV_COLUMNS)[number];
type CellVal = string | number | boolean | null;

function rowFrom(values: Partial<Record<Col, CellVal>>): CellVal[] {
  return CSV_COLUMNS.map((c) => (c in values ? (values[c] ?? "") : ""));
}

export function bodiesToCsv(bodies: AssessmentBodyExport[]): string {
  const rows: CellVal[][] = [CSV_COLUMNS.map((c) => c)];

  for (const a of bodies) {
    rows.push(
      rowFrom({
        assessment_slug: a.slug,
        row_type: "ASSESSMENT",
        assessment_title: a.title,
        description: a.description ?? "",
        cover_image_url: a.coverImageUrl ?? "",
        estimated_minutes: a.estimatedMinutes ?? "",
        thank_you_message: a.thankYouMessage ?? "",
        collect_first_name: a.collectFirstName,
        first_name_required: a.firstNameRequired,
        collect_last_name: a.collectLastName,
        last_name_required: a.lastNameRequired,
        collect_email: a.collectEmail,
        email_required: a.emailRequired,
        collect_mobile: a.collectMobile,
        mobile_required: a.mobileRequired,
        collect_profession: a.collectProfession,
        profession_required: a.professionRequired,
        engine: a.engine ?? "GENERIC",
      }),
    );

    a.categories.forEach((c, ci) => {
      rows.push(
        rowFrom({
          assessment_slug: a.slug,
          row_type: "CATEGORY",
          category_index: ci,
          category_name: c.name,
          category_description: c.description ?? "",
          category_page: c.page ?? 1,
        }),
      );
      c.questions.forEach((q, qi) => {
        rows.push(
          rowFrom({
            assessment_slug: a.slug,
            row_type: "QUESTION",
            category_index: ci,
            question_index: qi,
            question_text: q.text,
            weight: q.weight,
            required: q.required,
            question_scoring_role: q.scoringRole ?? "",
          }),
        );
        q.options.forEach((o, oi) => {
          rows.push(
            rowFrom({
              assessment_slug: a.slug,
              row_type: "OPTION",
              category_index: ci,
              question_index: qi,
              option_index: oi,
              option_label: o.label,
              option_value: o.value,
              option_diagnosis_clause: o.diagnosisClause ?? "",
              option_is_assumption: o.isAssumption ?? false,
            }),
          );
        });
      });
    });

    a.resultBands.forEach((b, bi) => {
      rows.push(
        rowFrom({
          assessment_slug: a.slug,
          row_type: "BAND",
          band_index: bi,
          band_level: b.level,
          band_title: b.title,
          band_description: b.description ?? "",
          band_min: b.minScore,
          band_max: b.maxScore,
        }),
      );
    });
  }

  return toCsv(rows);
}

/* ----------------------------------------------------- CSV -> document ----- */

const emptyToNull = (s: string): string | null => (s === "" ? null : s);
const toBool = (s: string, dflt: boolean): boolean => {
  const t = s.trim().toLowerCase();
  return t === "true" ? true : t === "false" ? false : dflt;
};
const toNum = (s: string): number => {
  const n = Number(s.trim());
  return Number.isFinite(n) ? n : 0;
};
const toInt = (s: string): number => Math.trunc(toNum(s));
const toIntOrNull = (s: string): number | null =>
  s.trim() === "" ? null : Math.trunc(toNum(s));

interface AccOption {
  label: string;
  value: number;
  diagnosisClause: string | null;
  isAssumption: boolean;
}
interface AccQuestion {
  text: string;
  weight: number;
  required: boolean;
  scoringRole: string | null;
  options: AccOption[];
}
interface AccCategory {
  name: string;
  description: string | null;
  page: number;
  questions: AccQuestion[];
}
interface AccBand {
  level: AssessmentBodyExport["resultBands"][number]["level"];
  title: string;
  description: string | null;
  minScore: number;
  maxScore: number;
}
interface Acc {
  slug: string;
  title: string;
  engine: string;
  description: string | null;
  coverImageUrl: string | null;
  estimatedMinutes: number | null;
  thankYouMessage: string | null;
  collectFirstName: boolean;
  firstNameRequired: boolean;
  collectLastName: boolean;
  lastNameRequired: boolean;
  collectEmail: boolean;
  emailRequired: boolean;
  collectMobile: boolean;
  mobileRequired: boolean;
  collectProfession: boolean;
  professionRequired: boolean;
  categories: AccCategory[];
  bands: AccBand[];
}

const compact = <T>(arr: T[]): T[] => arr.filter((x) => x !== undefined);

/** Reconstruct the export document from the lossless CSV. */
export function csvToDocument(
  raw: string,
): { ok: true; value: unknown } | { ok: false; errors: string[] } {
  const rows = parseCsv(raw);
  if (rows.length < 2) return { ok: false, errors: ["CSV has no data rows."] };

  const header = rows[0] ?? [];
  const colIndex = (name: string) => header.indexOf(name);
  if (colIndex("assessment_slug") === -1 || colIndex("row_type") === -1) {
    return {
      ok: false,
      errors: ['CSV is missing required columns "assessment_slug" and/or "row_type".'],
    };
  }
  const cell = (row: string[], name: string): string => {
    const i = colIndex(name);
    return i === -1 ? "" : (row[i] ?? "");
  };

  const map = new Map<string, Acc>();
  const getAcc = (slug: string): Acc => {
    let a = map.get(slug);
    if (!a) {
      a = {
        slug,
        title: "",
        engine: "GENERIC",
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
        collectProfession: true,
        professionRequired: true,
        categories: [],
        bands: [],
      };
      map.set(slug, a);
    }
    return a;
  };
  const ensureCat = (acc: Acc, ci: number): AccCategory => {
    if (!acc.categories[ci]) {
      acc.categories[ci] = { name: "", description: null, page: 1, questions: [] };
    }
    return acc.categories[ci];
  };
  const ensureQ = (cat: AccCategory, qi: number): AccQuestion => {
    if (!cat.questions[qi]) {
      cat.questions[qi] = { text: "", weight: 0, required: false, scoringRole: null, options: [] };
    }
    return cat.questions[qi];
  };

  let recognized = 0;
  for (const row of rows.slice(1)) {
    const slug = cell(row, "assessment_slug").trim();
    if (!slug) continue;
    const acc = getAcc(slug);
    const type = cell(row, "row_type").trim().toUpperCase();

    if (type === "ASSESSMENT") {
      recognized += 1;
      acc.title = cell(row, "assessment_title");
      acc.description = emptyToNull(cell(row, "description"));
      acc.coverImageUrl = emptyToNull(cell(row, "cover_image_url"));
      acc.estimatedMinutes = toIntOrNull(cell(row, "estimated_minutes"));
      acc.thankYouMessage = emptyToNull(cell(row, "thank_you_message"));
      acc.collectFirstName = toBool(cell(row, "collect_first_name"), true);
      acc.firstNameRequired = toBool(cell(row, "first_name_required"), false);
      acc.collectLastName = toBool(cell(row, "collect_last_name"), true);
      acc.lastNameRequired = toBool(cell(row, "last_name_required"), false);
      acc.collectEmail = toBool(cell(row, "collect_email"), true);
      acc.emailRequired = toBool(cell(row, "email_required"), true);
      acc.collectMobile = toBool(cell(row, "collect_mobile"), true);
      acc.mobileRequired = toBool(cell(row, "mobile_required"), false);
      acc.collectProfession = toBool(cell(row, "collect_profession"), true);
      acc.professionRequired = toBool(cell(row, "profession_required"), true);
      const eng = cell(row, "engine").trim().toUpperCase();
      acc.engine = eng === "CLINIC_AUDIT" ? "CLINIC_AUDIT" : "GENERIC";
    } else if (type === "CATEGORY") {
      recognized += 1;
      const c = ensureCat(acc, toInt(cell(row, "category_index")));
      c.name = cell(row, "category_name");
      c.description = emptyToNull(cell(row, "category_description"));
      const p = toInt(cell(row, "category_page"));
      c.page = p === 2 ? 2 : 1;
    } else if (type === "QUESTION") {
      recognized += 1;
      const c = ensureCat(acc, toInt(cell(row, "category_index")));
      const q = ensureQ(c, toInt(cell(row, "question_index")));
      q.text = cell(row, "question_text");
      q.weight = toNum(cell(row, "weight"));
      q.required = toBool(cell(row, "required"), false);
      q.scoringRole = emptyToNull(cell(row, "question_scoring_role"));
    } else if (type === "OPTION") {
      recognized += 1;
      const c = ensureCat(acc, toInt(cell(row, "category_index")));
      const q = ensureQ(c, toInt(cell(row, "question_index")));
      q.options[toInt(cell(row, "option_index"))] = {
        label: cell(row, "option_label"),
        value: toInt(cell(row, "option_value")),
        diagnosisClause: emptyToNull(cell(row, "option_diagnosis_clause")),
        isAssumption: toBool(cell(row, "option_is_assumption"), false),
      };
    } else if (type === "BAND") {
      recognized += 1;
      acc.bands[toInt(cell(row, "band_index"))] = {
        level: cell(row, "band_level").trim().toUpperCase() as AccBand["level"],
        title: cell(row, "band_title"),
        description: emptyToNull(cell(row, "band_description")),
        minScore: toNum(cell(row, "band_min")),
        maxScore: toNum(cell(row, "band_max")),
      };
    }
  }

  if (recognized === 0) {
    return {
      ok: false,
      errors: ["Unrecognized CSV format. Re-export from this version."],
    };
  }

  const bodies = Array.from(map.values()).map((acc) => ({
    title: acc.title,
    slug: acc.slug,
    description: acc.description,
    coverImageUrl: acc.coverImageUrl,
    estimatedMinutes: acc.estimatedMinutes,
    thankYouMessage: acc.thankYouMessage,
    collectFirstName: acc.collectFirstName,
    firstNameRequired: acc.firstNameRequired,
    collectLastName: acc.collectLastName,
    lastNameRequired: acc.lastNameRequired,
    collectEmail: acc.collectEmail,
    emailRequired: acc.emailRequired,
    collectMobile: acc.collectMobile,
    mobileRequired: acc.mobileRequired,
    collectProfession: acc.collectProfession,
    professionRequired: acc.professionRequired,
    // Only emit the v2 fields when non-default, so a GENERIC assessment round-trips
    // identically to one exported before these columns existed (omitted == default).
    ...(acc.engine === "CLINIC_AUDIT" ? { engine: "CLINIC_AUDIT" as const } : {}),
    categories: compact(acc.categories).map((c, ci) => ({
      name: c.name,
      description: c.description,
      displayOrder: ci,
      ...(c.page === 2 ? { page: 2 } : {}),
      questions: compact(c.questions).map((q, qi) => ({
        text: q.text,
        type: "SINGLE_SELECT" as const,
        weight: q.weight,
        required: q.required,
        displayOrder: qi,
        ...(q.scoringRole ? { scoringRole: q.scoringRole } : {}),
        options: compact(q.options).map((o, oi) => ({
          label: o.label,
          value: o.value,
          displayOrder: oi,
          ...(o.diagnosisClause ? { diagnosisClause: o.diagnosisClause } : {}),
          ...(o.isAssumption ? { isAssumption: true } : {}),
        })),
      })),
    })),
    resultBands: compact(acc.bands).map((b, bi) => ({
      level: b.level,
      title: b.title,
      description: b.description,
      minScore: b.minScore,
      maxScore: b.maxScore,
      displayOrder: bi,
    })),
  }));

  return { ok: true, value: { schemaVersion: EXPORT_SCHEMA_VERSION, assessments: bodies } };
}

/* --------------------------------------------------------- parse + validate */

/** Parse + validate an uploaded export (one JSON shape, one CSV shape). */
export function parseDocument(raw: string, format: "json" | "csv"): ParseResult {
  // Strip a leading UTF-8 BOM (Excel / Windows editors add one on re-save).
  let text = raw;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  let candidate: unknown;
  if (format === "json") {
    try {
      candidate = JSON.parse(text);
    } catch {
      return { ok: false, errors: ["File is not valid JSON."] };
    }
  } else {
    const built = csvToDocument(text);
    if (!built.ok) return built;
    candidate = built.value;
  }

  const parsed = assessmentExportSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, data: parsed.data };

  const obj =
    candidate && typeof candidate === "object"
      ? (candidate as Record<string, unknown>)
      : undefined;

  // Friendlier than a raw Zod dump for the two most common mistakes:
  if (obj && "assessment" in obj && !("assessments" in obj)) {
    return {
      ok: false,
      errors: [
        'This looks like an older single-assessment export (it uses "assessment" instead of "assessments"). Re-export from this version.',
      ],
    };
  }
  const v = obj?.schemaVersion;
  if (v !== undefined && v !== EXPORT_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        `Unsupported schemaVersion ${JSON.stringify(v)}. This server supports version ${EXPORT_SCHEMA_VERSION}.`,
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
