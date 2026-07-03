/**
 * Pure-logic checks for the Gita Mentor read builder. No DB / no env.
 * Run: npx tsx scripts/verify-mentor.ts
 */
import { normalizeEmail, buildMentorResponse, type MentorRecord } from "../src/lib/mentor/read";
import { type ResultSnapshot } from "../src/lib/result/snapshot";

let failures = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) {
    failures++;
    console.error(`FAIL ${name}\n  got:  ${g}\n  want: ${w}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

eq("email normalize", normalizeEmail("  Me@X.CoM "), "me@x.com");

// not found -> mentor should prompt to take the assessment
const nf = buildMentorResponse(null);
eq("null -> found false", nf.found, false);
eq("null -> empty categories", nf.categories, []);

// record with no snapshot -> also not found
const noSnap: MentorRecord = {
  leadEmail: "a@b.com", leadFirstName: null, leadLastName: null, leadProfession: null,
  completedAt: new Date("2026-07-01T12:00:00Z"), resultSnapshot: null,
  assessmentSlug: "x", assessmentTitle: "X",
};
eq("no snapshot -> found false", buildMentorResponse(noSnap).found, false);

// full snapshot -> full response
const snap: ResultSnapshot = {
  customerId: "ABC23456",
  scorePercent: 77,
  scoreRaw: 46,
  max: 60,
  resultBand: "Stable",
  resultBandLevel: "MEDIUM",
  resultSuggestion: "Keep going.",
  aiStatement: "You are holding it together.",
  categories: [
    { name: "Inner Pressure", score: 12, max: 15, band: "LOW", meaning: "ok" },
    { name: "Relationships", score: 9, max: 15, band: "MEDIUM", meaning: null },
  ],
};
const rec: MentorRecord = {
  leadEmail: "buyer@example.com",
  leadFirstName: "Arjuna",
  leadLastName: "Das",
  leadProfession: "Business Owner",
  completedAt: new Date("2026-07-01T12:00:00Z"),
  resultSnapshot: snap,
  assessmentSlug: "executive-emotional-stability-assessment",
  assessmentTitle: "Executive Emotional Stability Assessment",
};
const out = buildMentorResponse(rec);
eq("found true", out.found, true);
eq("email", out.email, "buyer@example.com");
eq("first name", out.first_name, "Arjuna");
eq("profession", out.profession, "Business Owner");
eq("assessment slug", out.assessment?.slug, "executive-emotional-stability-assessment");
eq("completed_at iso", out.completed_at, "2026-07-01T12:00:00.000Z");
eq("overall band", out.overall?.band, "Stable");
eq("overall level", out.overall?.level, "MEDIUM");
eq("overall percentage", out.overall?.percentage, 77);
eq("overall suggestion", out.overall?.suggestion, "Keep going.");
eq("ai statement", out.ai_statement, "You are holding it together.");
eq("categories count", out.categories.length, 2);
eq("category shape", out.categories[0], { name: "Inner Pressure", band: "LOW", score: 12, max: 15, meaning: "ok" });
eq("category null meaning", out.categories[1]?.meaning ?? null, null);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll mentor checks passed.");
