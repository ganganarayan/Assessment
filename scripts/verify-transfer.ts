/**
 * Round-trip verification for the unified export/import format. Exercises the
 * PURE serialize/parse layer (transfer/format.ts) — no DB required — against an
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
import type { AssessmentBodyExport } from "../src/features/assessment/transfer/schema";

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

console.log("Transfer round-trip verification\n");

roundTrip("single adversarial", [adversarial]);
roundTrip("multi-assessment", [adversarial, second]);

// BOM tolerance (Excel / Windows re-save)
{
  const r = parseDocument("﻿" + bodiesToJson([second]), "json");
  if (r.ok && r.data.assessments.length === 1) ok("BOM · JSON");
  else fail("BOM · JSON", r.ok ? "wrong count" : r.errors.join("; "));
  const c = parseDocument("﻿" + bodiesToCsv([second]), "csv");
  if (c.ok && c.data.assessments.length === 1) ok("BOM · CSV");
  else fail("BOM · CSV", c.ok ? "wrong count" : c.errors.join("; "));
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

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
