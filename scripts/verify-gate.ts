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

/**
 * Files that hand the funnel-visible write to somebody else.
 *
 * pages.ts is the one: the result-page builder writes DRAFT rows, which no respondent
 * can see, and its Publish hands the live snapshot to `mirrorPublished` - the single
 * place the page library touches live traffic. Requiring the flush to appear in
 * pages.ts itself would be requiring it in the wrong file, and the obvious way to make
 * that check pass again is to add a second flush nobody needs.
 *
 * So the delegate is named, and then CHECKED ITSELF. That is the part that keeps this
 * honest: the indirection is allowed, and it cannot quietly lose the flush, because
 * the module it was delegated to has to prove it does the thing.
 */
const DELEGATES: Record<string, { call: string; path: string }> = {
  "pages.ts": { call: "mirrorPublished", path: "src/features/result-pages/mirror.ts" },
};

/**
 * A CALL, not a mention.
 *
 * The check used to be `src.includes("invalidatePublicAssessment")`, which the import
 * line satisfies all by itself - so a file could import the flush, never call it, and
 * pass. Proved by deleting both calls from mirror.ts and watching this script report
 * PASS twice. Matching the name followed by an open paren is the difference between
 * "this file knows the function exists" and "this file runs it".
 */
const calls = (src: string, name: string): boolean =>
  new RegExp(`${name}\\w*\\s*\\(`).test(src);

const present = new Set(readdirSync(ACTIONS_DIR));
for (const file of MUST_INVALIDATE) {
  if (!present.has(file)) {
    failures++;
    console.log(`FAIL  ${file} is listed here but no longer exists - update the list`);
    continue;
  }
  const src = readFileSync(join(ACTIONS_DIR, file), "utf8");
  const delegate = DELEGATES[file];
  const direct = calls(src, "invalidatePublicAssessment");
  const delegated = !!delegate && calls(src, delegate.call);
  const ok = direct || delegated;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${file} drops the cached funnel after writing${delegated && !direct ? ` (via ${delegate!.call})` : ""}`,
  );
  if (!delegated || !delegate) continue;
  let delegateSrc = "";
  try {
    delegateSrc = readFileSync(join(process.cwd(), delegate.path), "utf8");
  } catch {
    failures++;
    console.log(`FAIL  ${delegate.path} is where ${file} sends the write, and it is missing`);
    continue;
  }
  const delegateOk = calls(delegateSrc, "invalidatePublicAssessment");
  if (!delegateOk) failures++;
  console.log(`${delegateOk ? "PASS" : "FAIL"}  and ${delegate.path} does the flush on its behalf`);
}

console.log(failures === 0 ? "\nverify:gate OK" : `\nverify:gate FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
