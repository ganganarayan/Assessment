import { z } from "zod";
import {
  assessmentBodyExport,
  assessmentExportSchema,
  EXPORT_SCHEMA_VERSION,
} from "@/features/assessment/transfer/schema";
import { parseDocument } from "@/features/assessment/transfer/format";
import coachClientFit from "@/features/templates/builtin/coach-client-fit.json";

/**
 * The import sample, DERIVED from the live schemas rather than written by hand.
 *
 * WHY IT IS GENERATED. A tenant hands this file to an AI tool and asks it to write an
 * assessment; whatever comes back is imported. A hand-maintained sample is a promise
 * that somebody will remember to update it on the day they add a field, and nobody
 * does - so the day after a schema change the tool starts producing files that import
 * with errors, and the owner has no way to know the sample was the stale part.
 *
 * So: the field reference is read off `assessmentBodyExport` itself, and the worked
 * example is a real built-in template run through the REAL import parser. Change the
 * schema and this file changes with it, on staging and on production, with nothing to
 * remember.
 *
 * 🔴 And it checks itself. `buildImportSample` parses its own example through
 * `parseDocument` - the same function the Import screen uses - and refuses to produce
 * a sample that would not import. A sample that cannot be imported is worse than no
 * sample: it teaches the tool the wrong shape and the owner debugs their own file.
 */

/** What one field of the import format is, in terms an AI tool can follow. */
export interface SampleField {
  name: string;
  /** "string", "number", "boolean", "string[]", "object", "enum", … */
  type: string;
  required: boolean;
  /** Present for enums: the only values accepted. */
  values?: string[];
  /** Present where the schema caps a length or a count. */
  limit?: string;
  /** Set when the introspector could not read the shape - see verify:import-sample. */
  unknown?: true;
}

/**
 * Read a Zod type down to something describable.
 *
 * Deliberately small: it understands the shapes this schema actually uses and marks
 * anything else `unknown` rather than guessing. scripts/verify-import-sample.ts fails
 * when any field comes back unknown, so a new shape in the schema surfaces as a failing
 * check instead of as a silently vague sample.
 */
function describe(schema: z.ZodTypeAny): Omit<SampleField, "name"> {
  let node: z.ZodTypeAny = schema;
  let required = true;
  let limit: string | undefined;

  // Unwrap the wrappers that only change optionality or add a default.
  for (let i = 0; i < 12; i++) {
    const def = node._def as { typeName?: string; innerType?: z.ZodTypeAny; schema?: z.ZodTypeAny };
    const name = def.typeName;
    if (name === "ZodOptional" || name === "ZodNullable" || name === "ZodDefault") {
      required = false;
      node = (def.innerType ?? node) as z.ZodTypeAny;
      continue;
    }
    if (name === "ZodEffects") {
      node = (def.schema ?? node) as z.ZodTypeAny;
      continue;
    }
    break;
  }

  const def = node._def as {
    typeName?: string;
    values?: string[];
    type?: z.ZodTypeAny;
    checks?: { kind: string; value?: number }[];
    options?: z.ZodTypeAny[];
  };

  const caps = (checks: { kind: string; value?: number }[] | undefined, unit: string) => {
    const max = checks?.find((c) => c.kind === "max")?.value;
    return max === undefined ? undefined : `max ${max} ${unit}`;
  };

  switch (def.typeName) {
    case "ZodString":
      limit = caps(def.checks, "characters");
      return { type: "string", required, ...(limit ? { limit } : {}) };
    case "ZodNumber":
      return { type: "number", required };
    case "ZodBoolean":
      return { type: "boolean", required };
    case "ZodEnum":
      return { type: "enum", required, values: def.values ?? [] };
    case "ZodLiteral":
      return { type: "literal", required, values: [String((node._def as { value?: unknown }).value)] };
    case "ZodArray": {
      const inner = def.type ? describe(def.type) : { type: "unknown" as const };
      limit = caps(def.checks, "items");
      return { type: `${inner.type}[]`, required, ...(limit ? { limit } : {}) };
    }
    case "ZodObject":
      return { type: "object", required };
    case "ZodUnknown":
    case "ZodAny":
      return { type: "any", required };
    case "ZodUnion": {
      const parts = (def.options ?? []).map((o) => describe(o).type);
      return { type: parts.length ? Array.from(new Set(parts)).join(" | ") : "unknown", required };
    }
    default:
      return { type: "unknown", required, unknown: true };
  }
}

/** Every top-level field of the import format, read off the schema itself. */
export function sampleFields(): SampleField[] {
  const shape = (assessmentBodyExport._def as { shape: () => Record<string, z.ZodTypeAny> }).shape();
  return Object.entries(shape)
    .map(([name, schema]) => ({ name, ...describe(schema) }))
    .sort((a, b) => (a.required === b.required ? a.name.localeCompare(b.name) : a.required ? -1 : 1));
}

export interface ImportSample {
  generatedAt: string;
  /** The build this came from, so a stale download can be told apart from a fresh one. */
  commit: string;
  instructions: string[];
  schemaVersion: number;
  fields: SampleField[];
  example: unknown;
}

const INSTRUCTIONS = [
  "Produce ONE JSON file in exactly the shape of `example` below, and nothing else - no markdown fence, no commentary.",
  "Keep the top level as it is: schemaVersion, and an `assessments` array. One assessment is an array of one.",
  "`fields` lists every key an assessment may carry, whether it is required, and the only values an enum accepts. Do not invent keys and do not invent enum values.",
  "Custom fields (preResultFields, optinFields) accept type \"text\" or \"select\" ONLY. A long answer is \"text\". A dropdown is \"select\" and needs a non-empty `options` array of plain strings.",
  "`slug` must be lowercase letters, numbers and hyphens. It must be unique: the importer will offer to copy or replace if it already exists.",
  "Every question needs a `category`, and every option needs a `label` and a numeric `value`.",
  "Result bands must cover the score range you intend; a respondent whose score falls in no band gets no band.",
  "Leave out anything you have no value for rather than sending null, unless the field is listed as required.",
];

/**
 * Build the sample, and prove it imports before handing it over.
 *
 * Throws when the example no longer parses, which is the point: that means the schema
 * moved and this file is the thing that must be fixed, said out loud at the moment
 * somebody asks for it rather than discovered by a tenant whose import failed.
 */
export function buildImportSample(commit: string): ImportSample {
  const body = (coachClientFit as { body: unknown }).body;
  const doc = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    assessments: [body],
  };

  // The same parser the Import screen runs. If this cannot read it, nobody could.
  const parsed = parseDocument(JSON.stringify(doc), "json");
  if (!parsed.ok) {
    throw new Error(
      `The import sample no longer validates against the import schema, so it was not served. ` +
        `Fix src/features/assessment/transfer/sample.ts (or the schema). Errors: ${parsed.errors.join("; ")}`,
    );
  }

  // Serve what the parser produced, not the raw template: normalization (defaults
  // filled, unrenderable field types healed) is part of what a correct file looks
  // like, and the example should show the shape that survives it.
  const normalized = assessmentExportSchema.safeParse(parsed.data);

  return {
    generatedAt: new Date().toISOString(),
    commit,
    instructions: INSTRUCTIONS,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    fields: sampleFields(),
    example: normalized.success ? normalized.data : parsed.data,
  };
}
