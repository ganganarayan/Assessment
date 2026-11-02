/**
 * The bridge between a TEMPLATE BODY and the BUILDER'S SETTINGS FORM.
 *
 * A template's `body` is `assessmentBodyExport` - the portable transfer shape. The
 * builder's settings form edits an `AssessmentInput`. They describe the same funnel in
 * two different dialects: the transfer shape writes an empty optional as `null` or omits
 * the key, the form writes it as `""`; the transfer shape omits anything that was never
 * set, the form needs every key present.
 *
 * 🔴 THE LOSSLESSNESS RULE, AND WHY IT IS A RULE RATHER THAN AN INTENTION.
 *
 * `settingsToBody` NEVER rewrites a field whose value did not change. It starts from the
 * caller's own body, asks `settingsFromBody` what each field currently reads as, and
 * writes only where the form's value differs. So a document that is opened and saved
 * without an edit comes back BYTE-IDENTICAL: same keys, same `null`-versus-absent, same
 * order. A field this module maps imprecisely cannot corrupt an untouched document,
 * because an untouched document is never written to.
 *
 * That matters more than it sounds. The owner opens a template to fix one question. If
 * the save path re-encoded all sixty settings on the way past, a single mis-mapped
 * optional would silently drop a result page, and he would find out weeks later from a
 * tenant whose funnel ended nowhere.
 *
 * THE SECOND GUARANTEE is at the bottom of this file: two type-level assertions that
 * fail the BUILD if a field is added to either shape and not wired here. A new settings
 * field cannot quietly become uneditable in templates, and a new transfer field cannot
 * quietly become a field the template editor drops.
 *
 * PURE. No database import, no `server-only`, no Prisma. It runs in the browser (the
 * builder holds the whole document in state) and under tsx in the verify script.
 */
import type { AssessmentBodyExport } from "@/features/assessment/transfer/schema";
import type { AssessmentInput, AudienceGateInput, PreResultField } from "@/features/assessment/schemas";
import { audienceGateSchema, EMPTY_AUDIENCE_GATE } from "@/features/assessment/schemas";
import { normalizeCustomFields } from "@/features/assessment/custom-fields";
import { readMetaEvents } from "@/features/assessment/meta-events";

/** What the settings form edits. The same type the live assessment builder posts. */
export type TemplateSettings = AssessmentInput;

/* -------------------------------------------------------------------------- */
/* Field groups                                                               */
/* -------------------------------------------------------------------------- */

/** Keys that exist on BOTH shapes, so a group can be looped over without casts. */
type SharedKey = keyof AssessmentInput & keyof AssessmentBodyExport;

/**
 * Optional text. `null` or absent in the body, `""` in the form.
 *
 * `""` is written back as `null` rather than `""`: the transfer shape's own convention,
 * and what every export in the repo already contains.
 */
const NULLABLE_STRINGS = [
  "description",
  "coverImageUrl",
  "thankYouMessage",
  "eyebrow",
  "subheadline",
  "qualifiedNote",
  "buttonColor",
  "buttonTextColor",
  "heatmapCode",
  "firstNameLabel",
  "lastNameLabel",
  "emailLabel",
  "mobileLabel",
  "professionLabel",
  "professionPlaceholder",
  "preResultHeading",
  "preResultSubtext",
  "introNotice",
  "startButtonLabel",
  "resultsButtonLabel",
  "trainingUrl",
  "targetUrl",
  "resultsContinueUrl",
  "resultsContinueLabel",
  "paymentUrl",
  "paymentReturnParam",
  "paymentHeadline",
  "paymentButtonLabel",
  "paymentIntroText",
] as const satisfies readonly SharedKey[];

/** Required text: always present on both sides, never nulled. */
const PLAIN_STRINGS = ["title", "slug"] as const satisfies readonly SharedKey[];

/**
 * `paymentEventName` is the odd one out: optional-but-not-nullable in the body
 * (`z.string().optional()`), so an empty value is the ABSENT key, never `null`.
 */
const OPTIONAL_STRINGS = ["paymentEventName"] as const satisfies readonly SharedKey[];

/** Whole numbers that may be absent. `undefined` in the form, `null` in the body. */
const NULLABLE_INTS = [
  "estimatedMinutes",
  "tokenTtlSeconds",
  "paymentAmount",
] as const satisfies readonly SharedKey[];

/** Whole numbers the form always carries. Absent in the body = the form's default. */
const INTS = ["retakeDays", "vslCountdownSeconds"] as const satisfies readonly SharedKey[];

/** Booleans. Absent in the body = the default recorded in BOOL_DEFAULTS. */
const BOOLS = [
  "collectFirstName",
  "firstNameRequired",
  "collectLastName",
  "lastNameRequired",
  "collectEmail",
  "emailRequired",
  "collectMobile",
  "mobileRequired",
  "collectProfession",
  "professionRequired",
  "leadCaptureAfter",
  "useAiStatement",
  "fireMetaCapi",
  "platformSignup",
] as const satisfies readonly SharedKey[];

/** Choice fields. Absent in the body = the default recorded in ENUM_DEFAULTS. */
const ENUMS = [
  "leadCaptureMode",
  "retakePolicy",
  "uniqueIdentifier",
  "questionDisplayMode",
  "engine",
  "nextStep",
] as const satisfies readonly SharedKey[];

/**
 * Defaults for a key the body does not carry.
 *
 * These are not invented here: each one is the default declared on the field in
 * `assessmentSchema` or `assessmentBodyExport`, so a template written before the field
 * existed reads in the builder exactly as the importer would read it.
 */
const BOOL_DEFAULTS: Record<(typeof BOOLS)[number], boolean> = {
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
  leadCaptureAfter: false,
  useAiStatement: true,
  fireMetaCapi: true,
  platformSignup: false,
};

const INT_DEFAULTS: Record<(typeof INTS)[number], number> = {
  retakeDays: 15,
  vslCountdownSeconds: 10,
};

const ENUM_DEFAULTS: { [K in (typeof ENUMS)[number]]: AssessmentInput[K] } = {
  leadCaptureMode: "ALL_AT_ONCE",
  retakePolicy: "DELAYED",
  uniqueIdentifier: "EMAIL",
  questionDisplayMode: "ALL",
  engine: "GENERIC",
  nextStep: "DESTINATION",
};

/**
 * Settings fields the TRANSFER SHAPE CANNOT CARRY, so the template editor must not
 * offer them.
 *
 * They are real settings on a live assessment, and a template has nowhere to put them:
 * two are flow preferences the export format never carried, and two name a row in the
 * importing workspace (an ad account, an AI instruction version), which means nothing in
 * a document that travels. Read as these fixed values and never written anywhere.
 *
 * The builder HIDES each of their controls in template mode. A visible switch that
 * silently discards what you set is worse than an absent one.
 */
export const UNCARRIED_SETTINGS = {
  autoAdvanceLastScreen: false,
  resultLinkShowsResult: false,
  aiPromptVersionId: "",
  adAccountId: "",
} as const;

/* -------------------------------------------------------------------------- */
/* Body -> settings                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Read a template body as the settings form's values.
 *
 * Deterministic: the same body always produces the same settings object. That is what
 * makes the change detection in `settingsToBody` trustworthy, so it is a property worth
 * keeping rather than an implementation detail.
 */
export function settingsFromBody(body: AssessmentBodyExport): TemplateSettings {
  // Built as a loose record and cast once at the end. The alternative is sixty
  // individually-cast assignments, which is the same unsoundness spelled out sixty
  // times; the type-level exhaustiveness checks at the bottom of this file are what
  // actually guarantee every key is present.
  const out: Record<string, unknown> = { ...UNCARRIED_SETTINGS };

  for (const k of PLAIN_STRINGS) out[k] = body[k];
  for (const k of NULLABLE_STRINGS) out[k] = body[k] ?? "";
  for (const k of OPTIONAL_STRINGS) out[k] = body[k] ?? "";
  for (const k of NULLABLE_INTS) out[k] = body[k] ?? undefined;
  for (const k of INTS) out[k] = body[k] ?? INT_DEFAULTS[k];
  for (const k of BOOLS) out[k] = body[k] ?? BOOL_DEFAULTS[k];
  for (const k of ENUMS) out[k] = body[k] ?? ENUM_DEFAULTS[k];

  out.professionOptions = [...(body.professionOptions ?? [])];
  out.preResultFields = normalizeCustomFields(body.preResultFields);
  out.optinFields = normalizeCustomFields(body.optinFields);
  out.metaEvents = readMetaEvents(body.metaEvents);
  out.audienceGate = readAudienceGate(body.audienceGate);

  return out as unknown as TemplateSettings;
}

/** Parse the stored audience-gate blob, falling back to an empty gate. Never throws:
 *  a blob this app cannot read must not cost the owner the whole editor. */
function readAudienceGate(value: unknown): AudienceGateInput {
  const parsed = audienceGateSchema.safeParse(value ?? undefined);
  return parsed.success ? parsed.data : { ...EMPTY_AUDIENCE_GATE, roles: [] };
}

/* -------------------------------------------------------------------------- */
/* Settings -> body                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Write edited settings back onto a body, touching only what changed.
 *
 * See the losslessness rule at the top of this file. `before` is what the body currently
 * reads as; every field is compared against it, and an unchanged field's key is left
 * exactly as the caller's body had it - present, absent or `null`.
 */
export function settingsToBody(
  body: AssessmentBodyExport,
  settings: TemplateSettings,
): AssessmentBodyExport {
  const before = settingsFromBody(body);
  const out: Record<string, unknown> = { ...body };

  for (const k of PLAIN_STRINGS) {
    if (settings[k] !== before[k]) out[k] = settings[k];
  }
  for (const k of NULLABLE_STRINGS) {
    const next = (settings[k] ?? "").trim() === "" ? null : settings[k];
    if (settings[k] !== before[k]) out[k] = next;
  }
  for (const k of OPTIONAL_STRINGS) {
    if (settings[k] === before[k]) continue;
    // Optional-not-nullable: emptying it REMOVES the key, because `null` would not
    // parse and `""` is not what an unset value looks like in this format.
    if ((settings[k] ?? "") === "") delete out[k];
    else out[k] = settings[k];
  }
  for (const k of NULLABLE_INTS) {
    if (settings[k] !== before[k]) out[k] = settings[k] ?? null;
  }
  for (const k of INTS) {
    if (settings[k] !== before[k]) out[k] = settings[k];
  }
  for (const k of BOOLS) {
    if (settings[k] !== before[k]) out[k] = settings[k];
  }
  for (const k of ENUMS) {
    if (settings[k] !== before[k]) out[k] = settings[k];
  }

  if (!sameStringArray(settings.professionOptions, before.professionOptions)) {
    out.professionOptions = [...settings.professionOptions];
  }
  if (!sameJson(settings.preResultFields, before.preResultFields)) {
    out.preResultFields = cleanFields(settings.preResultFields);
  }
  if (!sameJson(settings.optinFields, before.optinFields)) {
    out.optinFields = cleanFields(settings.optinFields);
  }
  if (!sameJson(settings.metaEvents, before.metaEvents)) {
    out.metaEvents = { ...settings.metaEvents };
  }
  if (!sameJson(settings.audienceGate, before.audienceGate)) {
    out.audienceGate = cleanAudienceGate(settings.audienceGate);
  }

  /**
   * `paidMode` is derived, not edited.
   *
   * The importer ignores the stored value and recomputes it from `nextStep`
   * (transfer/import.ts), and so does the live save action. It is kept in step here only
   * when `nextStep` actually changed and the body already carried the key, so a document
   * that never had it does not grow one and an untouched document is not written to.
   */
  if (settings.nextStep !== before.nextStep && "paidMode" in body) {
    out.paidMode = settings.nextStep === "PAYMENT";
  }

  return out as unknown as AssessmentBodyExport;
}

/** Drop blank labels and blank dropdown options, the way the live builder does on save. */
function cleanFields(fields: PreResultField[]): PreResultField[] {
  return fields
    .map((f) => ({ ...f, label: f.label.trim(), options: f.options.map((o) => o.trim()).filter(Boolean) }))
    .filter((f) => f.label.length > 0);
}

/** Trim role labels and drop blank rows, the way the live builder does on save. */
function cleanAudienceGate(gate: AudienceGateInput): AudienceGateInput {
  return {
    ...gate,
    roles: gate.roles.map((r) => ({ ...r, label: r.label.trim() })).filter((r) => r.label.length > 0),
  };
}

function sameStringArray(a: readonly string[], b: unknown): boolean {
  return Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Structural equality for the small objects above. They are plain JSON by
 *  construction (zod-parsed or form state), so stringify is a fair comparison. */
function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* -------------------------------------------------------------------------- */
/* Build-time guarantees                                                      */
/* -------------------------------------------------------------------------- */

/** Every settings key this module accounts for, one way or another. */
type HandledSettingsKey =
  | (typeof PLAIN_STRINGS)[number]
  | (typeof NULLABLE_STRINGS)[number]
  | (typeof OPTIONAL_STRINGS)[number]
  | (typeof NULLABLE_INTS)[number]
  | (typeof INTS)[number]
  | (typeof BOOLS)[number]
  | (typeof ENUMS)[number]
  | keyof typeof UNCARRIED_SETTINGS
  | "professionOptions"
  | "preResultFields"
  | "optinFields"
  | "metaEvents"
  | "audienceGate";

/**
 * Body keys that are NOT settings, and are therefore carried through untouched.
 *
 * The questions, the bands and the gate have their own editors in the template builder
 * and are edited on the document directly, not through the settings form. The rest is
 * either derived (`paidMode`), informational (`createdAt`), or an opaque blob whose own
 * schema owns it. None of them is the settings form's business, and none may be lost.
 */
type PassThroughBodyKey =
  | "categories"
  | "resultBands"
  | "qualification"
  | "disqualifiedContent"
  | "resultPage"
  | "resultPagePublished"
  | "publishedPages"
  | "engineConfig"
  | "aiInstructions"
  | "createdAt"
  | "paidMode";

/**
 * 🔴 THESE TWO LINES ARE THE POINT.
 *
 * Add a field to `assessmentSchema` and the first fails until the template editor can
 * edit it (or it is listed as one the transfer shape cannot carry). Add a field to
 * `assessmentBodyExport` and the second fails until it is either mapped or declared a
 * pass-through. Both resolve at compile time, so `tsc --noEmit` and the Railway build
 * catch them; nobody has to remember this file exists.
 */
type UnhandledSettingsKey = Exclude<keyof AssessmentInput, HandledSettingsKey>;
type UnhandledBodyKey = Exclude<keyof AssessmentBodyExport, HandledSettingsKey | PassThroughBodyKey>;

export type SettingsMapIsComplete = UnhandledSettingsKey extends never ? true : UnhandledSettingsKey;
export type BodyMapIsComplete = UnhandledBodyKey extends never ? true : UnhandledBodyKey;

const _settingsMapIsComplete: SettingsMapIsComplete = true;
const _bodyMapIsComplete: BodyMapIsComplete = true;
void _settingsMapIsComplete;
void _bodyMapIsComplete;
