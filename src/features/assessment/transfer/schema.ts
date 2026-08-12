import { z } from "zod";
import { slugSchema } from "@/features/assessment/schemas";

/**
 * Portable assessment transfer format (export/import).
 *
 * JSON is the AUTHORITATIVE, lossless format — it captures everything needed to
 * recreate an assessment in another environment (staging -> production). No
 * database ids, tenant, owner, submissions, or timestamps are included; those
 * are environment-specific and regenerated on import.
 *
 * `schemaVersion` is validated on import so future format changes can be
 * detected and migrated rather than silently mis-imported.
 */
export const EXPORT_SCHEMA_VERSION = 1 as const;

const optionExport = z.object({
  label: z.string().min(1),
  value: z.number().int(),
  displayOrder: z.number().int().nonnegative(),
  // CLINIC_AUDIT extras (added v2; optional so v1 files still import).
  diagnosisClause: z.string().nullable().optional(),
  isAssumption: z.boolean().optional(),
});

const questionExport = z.object({
  text: z.string().min(1),
  type: z.literal("SINGLE_SELECT").default("SINGLE_SELECT"),
  weight: z.number().min(0),
  required: z.boolean(),
  displayOrder: z.number().int().nonnegative(),
  // CLINIC_AUDIT funnel role (added v2).
  scoringRole: z.string().nullable().optional(),
  options: z.array(optionExport).min(2),
});

const categoryExport = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  displayOrder: z.number().int().nonnegative(),
  // Page 1 = assessment, 2 = queries (added v2; optional keeps old files valid).
  page: z.number().int().min(1).max(2).optional(),
  questions: z.array(questionExport),
});

const resultBandExport = z.object({
  level: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  minScore: z.number(),
  maxScore: z.number(),
  displayOrder: z.number().int().nonnegative(),
});

export const assessmentBodyExport = z.object({
  title: z.string().min(1),
  slug: slugSchema,
  description: z.string().nullable().optional(),
  coverImageUrl: z.string().nullable().optional(),
  estimatedMinutes: z.number().int().nullable().optional(),
  thankYouMessage: z.string().nullable().optional(),
  collectFirstName: z.boolean(),
  firstNameRequired: z.boolean(),
  collectLastName: z.boolean(),
  lastNameRequired: z.boolean(),
  collectEmail: z.boolean(),
  emailRequired: z.boolean(),
  collectMobile: z.boolean(),
  mobileRequired: z.boolean(),
  // Added later; default true so pre-existing export files still import cleanly.
  collectProfession: z.boolean().default(true),
  professionRequired: z.boolean().default(true),
  // ---- Added v2 (all optional so v1 files still import) --------------------
  // Scoring engine + its parameter overrides.
  engine: z.enum(["GENERIC", "CLINIC_AUDIT"]).optional(),
  engineConfig: z.unknown().nullable().optional(),
  // Funnel copy / opt-in configuration (environment-agnostic — carried for fidelity).
  eyebrow: z.string().nullable().optional(),
  subheadline: z.string().nullable().optional(),
  buttonColor: z.string().nullable().optional(),
  buttonTextColor: z.string().nullable().optional(),
  firstNameLabel: z.string().nullable().optional(),
  lastNameLabel: z.string().nullable().optional(),
  emailLabel: z.string().nullable().optional(),
  mobileLabel: z.string().nullable().optional(),
  professionLabel: z.string().nullable().optional(),
  professionPlaceholder: z.string().nullable().optional(),
  professionOptions: z.array(z.string()).optional(),
  leadCaptureAfter: z.boolean().optional(),
  preResultHeading: z.string().nullable().optional(),
  preResultSubtext: z.string().nullable().optional(),
  preResultFields: z.unknown().nullable().optional(),
  optinFields: z.unknown().nullable().optional(),
  introNotice: z.string().nullable().optional(),
  startButtonLabel: z.string().nullable().optional(),
  useAiStatement: z.boolean().optional(),
  nextStep: z.enum(["PAYMENT", "DESTINATION", "RESULTS"]).optional(),
  questionDisplayMode: z.enum(["ALL", "CATEGORY", "SINGLE"]).optional(),
  vslCountdownSeconds: z.number().int().optional(),
  categories: z.array(categoryExport),
  resultBands: z.array(resultBandExport),
});

/**
 * THE export/import document — one format for everything. A single assessment
 * exports as an array of one; "Export All" as an array of many. Import accepts
 * exactly this shape, so any export round-trips back in.
 */
export const assessmentExportSchema = z.object({
  schemaVersion: z.literal(EXPORT_SCHEMA_VERSION),
  exportedAt: z.string().optional(),
  assessments: z.array(assessmentBodyExport).min(1, "No assessments in file."),
});

export type OptionExport = z.infer<typeof optionExport>;
export type QuestionExport = z.infer<typeof questionExport>;
export type CategoryExport = z.infer<typeof categoryExport>;
export type ResultBandExport = z.infer<typeof resultBandExport>;
export type AssessmentBodyExport = z.infer<typeof assessmentBodyExport>;
export type AssessmentExport = z.infer<typeof assessmentExportSchema>;

/** Per-assessment summary used by the import preview. */
export interface ImportPreviewItem {
  title: string;
  slug: string;
  categoryCount: number;
  questionCount: number;
  resultBandCount: number;
  slugExists: boolean;
}

export type ImportMode = "create" | "copy" | "replace";
