/**
 * verify:gate - the funnel's ENTRY, asserted as a pure function, plus the static rule
 * that every builder save drops the cached funnel payload.
 *
 * WHY THIS EXISTS. A tenant built a screening funnel out of nothing but qualification
 * questions - no scored questions at all, which is a legitimate and increasingly common
 * shape - and respondents went straight past the gate to the opt-in. Two mechanisms
 * could do that, and both are pinned here:
 *
 *   1. The gate is only live when it is ENABLED and has questions. Questions saved with
 *      the switch off are stored, shown in the builder, and skipped by the funnel.
 *   2. The public funnel payload is CACHED. A save that does not drop that cache leaves
 *      the owner testing the version of their funnel that existed before the save, for
 *      as long as they keep saving - which reads exactly like a feature that does not
 *      work.
 *
 * No DB, no network, no build.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  firstStep,
  afterGateStep,
  gateIsLive,
  type EntryInput,
  type EntryStep,
} from "../src/features/assessment/flow/entry";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${String(actual)}, expected ${String(expected)})`}`);
}

/** A funnel with nothing configured: no gates, scored questions, lead-first. */
const base: EntryInput = {
  qualificationEnabled: false,
  qualificationQuestions: 0,
  audienceGate: false,
  scoredQuestions: 6,
  leadCaptureAfter: false,
};

/** The reported shape: a gate and NOTHING else. */
const gateOnly: EntryInput = {
  ...base,
  qualificationEnabled: true,
  qualificationQuestions: 3,
  scoredQuestions: 0,
};

const cases: { name: string; input: EntryInput; first: EntryStep; afterGate: EntryStep }[] = [
  {
    name: "plain funnel opens on the intro",
    input: base,
    first: "intro",
    afterGate: "intro",
  },
  {
    name: "gate-only funnel, lead AFTER: gate first, then the opt-in",
    input: { ...gateOnly, leadCaptureAfter: true },
    first: "qualify",
    afterGate: "leadForm",
  },
  {
    name: "gate-only funnel, lead FIRST: gate still first, then the opt-in intro",
    input: { ...gateOnly, leadCaptureAfter: false },
    first: "qualify",
    afterGate: "intro",
  },
  {
    name: "gate + scored questions, lead AFTER: gate first, then the questions",
    input: { ...gateOnly, scoredQuestions: 6, leadCaptureAfter: true },
    first: "qualify",
    afterGate: "questions",
  },
  {
    name: "questions saved with the switch OFF are not a gate",
    input: { ...gateOnly, qualificationEnabled: false },
    first: "intro",
    afterGate: "intro",
  },
  {
    name: "switch ON with no questions is not a gate either",
    input: { ...gateOnly, qualificationQuestions: 0 },
    first: "intro",
    afterGate: "intro",
  },
  {
    name: "the qualification gate outranks the audience gate",
    input: { ...gateOnly, audienceGate: true },
    first: "qualify",
    afterGate: "intro",
  },
  {
    name: "audience gate alone opens on the audience gate",
    input: { ...base, audienceGate: true },
    first: "gate",
    afterGate: "intro",
  },
];

console.log("--- entry rules ---");
for (const c of cases) {
  check(`${c.name}: first screen`, firstStep(c.input), c.first);
  check(`${c.name}: after the gate`, afterGateStep(c.input), c.afterGate);
}

check("gate-only funnel counts as live", gateIsLive(gateOnly), true);
check("switch off is not live", gateIsLive({ ...gateOnly, qualificationEnabled: false }), false);

/**
 * Every server action that writes something the PUBLIC funnel renders must drop the
 * cached funnel payload. Checked statically, by file, because the cost of forgetting is
 * invisible in review and indistinguishable from a broken feature in use: the owner
 * saves, reloads, and sees the funnel as it was before the save.
 */
console.log("--- funnel cache invalidation ---");
const ACTIONS_DIR = join(process.cwd(), "src/features/assessment/actions");
/** Action files that write funnel-visible data. ownership/shared/track/submission are
 *  not in the list: they authorize, emit or record, they do not change the funnel. */
const MUST_INVALIDATE = [
  "assessment.ts",
  "qualification.ts",
  "category.ts",
  "question.ts",
  "result-band.ts",
  "category-band.ts",
  "routing.ts",
  "pages.ts",
  "import-text.ts",
  "transfer.ts",
];

const present = new Set(readdirSync(ACTIONS_DIR));
for (const file of MUST_INVALIDATE) {
  if (!present.has(file)) {
    failures++;
    console.log(`FAIL  ${file} is listed here but no longer exists - update the list`);
    continue;
  }
  const src = readFileSync(join(ACTIONS_DIR, file), "utf8");
  const ok = src.includes("invalidatePublicAssessment");
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${file} drops the cached funnel after writing`);
}

console.log(failures === 0 ? "\nverify:gate OK" : `\nverify:gate FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
