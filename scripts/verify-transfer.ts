/**
 * Round-trip verification for the unified export/import format. Exercises the
 * PURE serialize/parse layer (transfer/format.ts) - no DB required - against an
 * adversarial assessment: duplicate category names, duplicate question text, an
 * empty category, commas/quotes/newlines/leading+trailing spaces in content,
 * zero/negative option values, multiple assessments, BOM, and the legacy/wrong
 * shapes. Proves anything exported re-imports byte-for-byte.
 *
 *   npx tsx scripts/verify-transfer.ts
 */
import {
  bodiesToJson,
  bodiesToCsv,
  parseDocument,
} from "../src/features/assessment/transfer/format";
import { assessmentCreateData } from "../src/features/assessment/transfer/import";
import type { AssessmentBodyExport } from "../src/features/assessment/transfer/schema";
import { formatIST } from "../src/lib/date";

let failures = 0;
const ok = (name: string) => console.log(`  PASS  ${name}`);
const fail = (name: string, detail: string) => {
  failures += 1;
  console.log(`  FAIL  ${name}\n        ${detail}`);
};

/** Recursive key-sorted stringify so comparisons ignore key order. */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );
}
function eq(name: string, actual: unknown, expected: unknown) {
  const a = canon(actual);
  const e = canon(expected);
  if (a === e) ok(name);
  else fail(name, `expected ${e}\n        actual   ${a}`);
}

const adversarial: AssessmentBodyExport = {
  title: "Emotional, \"Status\" Check\nv2",
  slug: "emotional-status",
  description: "Line one, with comma\nLine two with \"quotes\"",
  coverImageUrl: "https://cdn.example.com/x,y.png",
  estimatedMinutes: 7,
  thankYouMessage: "Thanks!\n\nSee you soon.",
  collectFirstName: true,
  firstNameRequired: true,
  collectLastName: false,
  lastNameRequired: false,
  collectEmail: false, // non-default
  emailRequired: false, // non-default
  collectMobile: true,
  mobileRequired: true, // non-default
  collectProfession: false, // non-default (defaults to true)
  professionRequired: false, // non-default (defaults to true)
  categories: [
    {
      name: "General", // duplicate name #1
      description: "First general section",
      displayOrder: 0,
      questions: [
        {
          text: "Rate this", // duplicate text #1
          type: "SINGLE_SELECT",
          weight: 1.5,
          required: true,
          displayOrder: 0,
          options: [
            { label: "  N/A  ", value: 0, displayOrder: 0 }, // padded + zero
            { label: "Low, really", value: -2, displayOrder: 1 }, // comma + negative
          ],
        },
        {
          text: "Rate this", // duplicate text #2 (same as above, must NOT merge)
          type: "SINGLE_SELECT",
          weight: 2,
          required: false,
          displayOrder: 1,
          options: [
            { label: "Yes", value: 5, displayOrder: 0 },
            { label: "No", value: 1, displayOrder: 1 },
          ],
        },
      ],
    },
    {
      name: "General", // duplicate name #2 (must NOT merge with #1)
      description: null,
      displayOrder: 1,
      questions: [
        {
          text: "Another question",
          type: "SINGLE_SELECT",
          weight: 0,
          required: true,
          displayOrder: 0,
          options: [
            { label: "A", value: 1, displayOrder: 0 },
            { label: "B", value: 2, displayOrder: 1 },
          ],
        },
      ],
    },
    {
      name: "Empty section", // empty category (must survive)
      description: null,
      displayOrder: 2,
      questions: [],
    },
  ],
  resultBands: [
    { level: "LOW", title: "Low", description: "Great.\n\n", minScore: 0, maxScore: 25, displayOrder: 0 },
    { level: "MEDIUM", title: "Med", description: null, minScore: 26, maxScore: 60, displayOrder: 1 },
    { level: "HIGH", title: "High", description: "Watch, carefully", minScore: 61, maxScore: 100, displayOrder: 2 },
  ],
};

const second: AssessmentBodyExport = {
  ...adversarial,
  title: "Second",
  slug: "second-one",
  description: null,
  coverImageUrl: null,
  estimatedMinutes: null,
  thankYouMessage: null,
};

function roundTrip(name: string, bodies: AssessmentBodyExport[]) {
  // JSON
  const jsonRes = parseDocument(bodiesToJson(bodies, "2026-06-10T00:00:00.000Z"), "json");
  if (!jsonRes.ok) fail(`${name} · JSON`, jsonRes.errors.join("; "));
  else eq(`${name} · JSON`, jsonRes.data.assessments, bodies);

  // CSV
  const csvRes = parseDocument(bodiesToCsv(bodies), "csv");
  if (!csvRes.ok) fail(`${name} · CSV`, csvRes.errors.join("; "));
  else eq(`${name} · CSV`, csvRes.data.assessments, bodies);
}

// Clinic-audit engine: exercises the v2 fields (engine, category.page, scoringRole,
// option.diagnosisClause + isAssumption). Only NON-default v2 fields are set, so the
// round-trip (which omits defaults) matches exactly.
const clinic: AssessmentBodyExport = {
  title: "Clinic Audit",
  slug: "clinic-audit",
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
  engine: "CLINIC_AUDIT",
  categories: [
    {
      name: "Funnel",
      description: null,
      displayOrder: 0,
      questions: [
        {
          text: "Monthly enquiries?",
          type: "SINGLE_SELECT",
          weight: 1,
          required: true,
          displayOrder: 0,
          scoringRole: "ENQUIRIES",
          options: [
            { label: "60-120", value: 90, displayOrder: 0 },
            { label: "I don't know", value: 60, displayOrder: 1, isAssumption: true },
          ],
        },
        {
          text: "Book rate?",
          type: "SINGLE_SELECT",
          weight: 1,
          required: true,
          displayOrder: 1,
          scoringRole: "BOOK_RATE",
          options: [
            { label: "15-25", value: 20, displayOrder: 0, diagnosisClause: "few enquiries convert to a booking" },
            { label: "Under 15", value: 12, displayOrder: 1, diagnosisClause: "most enquiries never book" },
          ],
        },
      ],
    },
    {
      name: "Present situation",
      description: null,
      displayOrder: 1,
      page: 2,
      questions: [
        {
          text: "Treatment value?",
          type: "SINGLE_SELECT",
          weight: 1,
          required: true,
          displayOrder: 0,
          scoringRole: "TREATMENT_VALUE",
          options: [
            { label: "60k-120k", value: 90000, displayOrder: 0 },
            { label: "over 250k", value: 300000, displayOrder: 1 },
          ],
        },
      ],
    },
  ],
  resultBands: [],
};

console.log("Transfer round-trip verification\n");

roundTrip("single adversarial", [adversarial]);
roundTrip("multi-assessment", [adversarial, second]);
roundTrip("clinic-audit (v2 fields)", [clinic]);

/**
 * A ROUTED body: keys, a per-option rule, and a question default route.
 *
 * JSON only, deliberately. The CSV shape is one flat row per question and carries no
 * routing; the JSON document is the authoritative format and the one a template is
 * stored in. Round-tripping this through CSV would therefore and correctly lose the
 * branches, so this case asserts the JSON path alone rather than pretending otherwise.
 */
const routed: AssessmentBodyExport = {
  title: "Routed",
  slug: "routed",
  collectFirstName: true,
  firstNameRequired: false,
  collectLastName: false,
  lastNameRequired: false,
  collectEmail: true,
  emailRequired: false,
  collectMobile: false,
  mobileRequired: false,
  collectProfession: false,
  professionRequired: false,
  questionDisplayMode: "SINGLE",
  categories: [
    {
      key: "ask",
      name: "Ask",
      displayOrder: 0,
      questions: [
        {
          key: "q-why",
          text: "Which one?",
          type: "SINGLE_SELECT",
          weight: 0,
          required: true,
          displayOrder: 0,
          options: [
            {
              label: "The first",
              value: 0,
              displayOrder: 0,
              route: { action: "JUMP_TO_CATEGORY", targetQuestionKey: null, targetCategoryKey: "branch" },
            },
            {
              label: "The second",
              value: 0,
              displayOrder: 1,
              route: { action: "JUMP_TO_QUESTION", targetQuestionKey: "q-tail", targetCategoryKey: null },
            },
          ],
          defaultRoute: { action: "JUMP_TO_CATEGORY", targetQuestionKey: null, targetCategoryKey: "tail" },
        },
      ],
    },
    {
      key: "branch",
      name: "Branch",
      displayOrder: 1,
      questions: [
        {
          key: "q-branch",
          text: "Say more",
          type: "FREE_TEXT",
          weight: 0,
          required: false,
          displayOrder: 0,
          options: [],
          defaultRoute: { action: "JUMP_TO_CATEGORY", targetQuestionKey: null, targetCategoryKey: "tail" },
        },
      ],
    },
    {
      key: "tail",
      name: "Tail",
      displayOrder: 2,
      questions: [
        {
          key: "q-tail",
          text: "Anything else",
          type: "FREE_TEXT",
          weight: 0,
          required: false,
          displayOrder: 0,
          options: [],
        },
      ],
    },
  ],
  resultBands: [],
};

{
  const res = parseDocument(bodiesToJson([routed], "2026-06-10T00:00:00.000Z"), "json");
  if (!res.ok) fail("routed · JSON", res.errors.join("; "));
  else eq("routed · JSON", res.data.assessments, [routed]);
}


// BOM tolerance (Excel / Windows re-save)
{
  const r = parseDocument("﻿" + bodiesToJson([second]), "json");
  if (r.ok && r.data.assessments.length === 1) ok("BOM · JSON");
  else fail("BOM · JSON", r.ok ? "wrong count" : r.errors.join("; "));
  const c = parseDocument("﻿" + bodiesToCsv([second]), "csv");
  if (c.ok && c.data.assessments.length === 1) ok("BOM · CSV");
  else fail("BOM · CSV", c.ok ? "wrong count" : c.errors.join("; "));
}

// Backward compat: a pre-profession export (no collect_profession keys) imports
// and defaults both to true (so old files still round-trip cleanly).
{
  const legacy = {
    schemaVersion: 1,
    assessments: [
      {
        title: "Legacy",
        slug: "legacy-noprof",
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
        categories: [],
        resultBands: [],
      },
    ],
  };
  const r = parseDocument(JSON.stringify(legacy), "json");
  if (
    r.ok &&
    r.data.assessments[0]?.collectProfession === true &&
    r.data.assessments[0]?.professionRequired === true
  )
    ok("legacy file · profession defaults true");
  else fail("legacy file · profession defaults true", r.ok ? "wrong default" : r.errors.join("; "));
}

// Legacy single-assessment shape -> friendly error
{
  const r = parseDocument(JSON.stringify({ assessment: { title: "x", slug: "x" } }), "json");
  if (!r.ok && r.errors[0]?.includes("older single-assessment")) ok("legacy shape · friendly error");
  else fail("legacy shape · friendly error", r.ok ? "unexpectedly ok" : r.errors.join("; "));
}

// Wrong schemaVersion -> version error (not a generic dump)
{
  const r = parseDocument(JSON.stringify({ schemaVersion: 99, assessments: [] }), "json");
  if (!r.ok && r.errors[0]?.toLowerCase().includes("schemaversion")) ok("bad version · version error");
  else fail("bad version · version error", r.ok ? "unexpectedly ok" : r.errors.join("; "));
}

// Empty / header-only inputs -> clear errors (not a crash)
{
  const r = parseDocument("not json", "json");
  if (!r.ok) ok("invalid JSON · error");
  else fail("invalid JSON · error", "unexpectedly ok");
}

// A CSV must carry the fields that have no column of their own - the gate, the ending,
// the payment configuration - through assessment_json. They were being merged into the
// parser's accumulator and then dropped by the assembler, so a CSV exported WITH a gate
// imported WITHOUT one and said nothing. Guarded here because the loss was invisible:
// the file was right, the import was wrong, and only running the funnel showed it.
{
  const gated = {
    ...second,
    qualification: { enabled: true, note: "gate" },
    nextStep: "RESULTS",
    paymentAmount: 499,
  } as unknown as AssessmentBodyExport;
  const r = parseDocument(bodiesToCsv([gated]), "csv");
  const got = r.ok ? r.data.assessments[0] : undefined;
  if (
    got &&
    JSON.stringify(got.qualification) === JSON.stringify(gated.qualification) &&
    got.nextStep === "RESULTS" &&
    got.paymentAmount === 499
  )
    ok("CSV · columnless fields survive via assessment_json");
  else
    fail(
      "CSV · columnless fields survive via assessment_json",
      r.ok ? JSON.stringify({ q: got?.qualification, n: got?.nextStep, p: got?.paymentAmount }) : r.errors.join("; "),
    );
}

// created_at: the one timestamp the format carries. It must reach the spreadsheet as
// its own readable column AND survive the round trip, while staying something the
// importer merely reads - assessmentCreateData never maps it, so an imported row
// dates from its own arrival rather than from the file.
{
  const dated: AssessmentBodyExport = { ...second, createdAt: "2026-10-15T11:41:00.000Z" };
  const csv = bodiesToCsv([dated]);
  const rows = csv.split(/\r?\n/);
  const col = (rows[0] ?? "").split(",").indexOf("created_at");
  const cell = (rows[1] ?? "").split(",")[col];
  // The column a person reads is DD-MM-YYYY HH:MM in IST, not the ISO instant.
  if (col >= 0 && cell === formatIST(dated.createdAt!)) ok("created_at · own CSV column, read as IST");
  else fail("created_at · own CSV column, read as IST", `column ${col}, cell ${String(cell)}`);

  const back = parseDocument(csv, "csv");
  if (back.ok && back.data.assessments[0]?.createdAt === dated.createdAt) ok("created_at · survives CSV round trip");
  else fail("created_at · survives CSV round trip", back.ok ? String(back.data.assessments[0]?.createdAt) : back.errors.join("; "));

  // A file written before the field existed must still parse to no date at all,
  // rather than to a date invented at import time.
  const older = parseDocument(bodiesToJson([second]), "json");
  if (older.ok && older.data.assessments[0]?.createdAt === undefined) ok("created_at · absent when the file has none");
  else fail("created_at · absent when the file has none", older.ok ? String(older.data.assessments[0]?.createdAt) : older.errors.join("; "));
}

// --- SPLIT lead capture survives a round trip ---------------------------------------
//
// The mode decides the whole respondent order, so a file that loses it imports a
// funnel that looks right in the builder and runs differently. Three cases, and the
// last two are the ones that bite.
{
  const split: AssessmentBodyExport = {
    ...adversarial,
    slug: "split-mode",
    collectEmail: true,
    emailRequired: true,
    leadCaptureMode: "SPLIT",
  };
  const back = parseDocument(bodiesToJson([split]), "json");
  const got = back.ok ? back.data.assessments[0]?.leadCaptureMode : "PARSE_FAILED";
  eq("leadCaptureMode · SPLIT survives JSON round trip", got, "SPLIT");

  // A file written before the mode existed is not a file asking for a default to be
  // guessed: those assessments asked for everything on one screen.
  const older = parseDocument(bodiesToJson([second]), "json");
  const olderMode = older.ok ? older.data.assessments[0]?.leadCaptureMode : "PARSE_FAILED";
  eq("leadCaptureMode · absent in an older file", olderMode, undefined);
  eq(
    "leadCaptureMode · an older file imports as ALL_AT_ONCE",
    assessmentCreateData(second, second.slug, null).leadCaptureMode,
    "ALL_AT_ONCE",
  );

  eq(
    "leadCaptureMode · SPLIT imports as SPLIT",
    assessmentCreateData(split, split.slug, null).leadCaptureMode,
    "SPLIT",
  );

  // 🔴 SPLIT without an email would import a funnel that runs three screens and
  // records nobody - the email step IS the one that writes the lead.
  const splitNoEmail: AssessmentBodyExport = { ...split, collectEmail: false, emailRequired: false };
  eq(
    "leadCaptureMode · SPLIT without an email falls back rather than importing broken",
    assessmentCreateData(splitNoEmail, splitNoEmail.slug, null).leadCaptureMode,
    "ALL_AT_ONCE",
  );

  // Every collected field is mandatory in SPLIT, and an import writes straight to the
  // row without passing the save action that normally applies that.
  const imported = assessmentCreateData(split, split.slug, null);
  eq("SPLIT import · email is required", imported.emailRequired, true);
  eq("SPLIT import · a collected name is required", imported.firstNameRequired, true);
  eq(
    "SPLIT import · a field that is NOT collected stays not-required",
    imported.lastNameRequired,
    false,
  );
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
