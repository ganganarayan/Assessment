/**
 * verify:lead-split - SPLIT lead capture, asserted as pure functions.
 *
 * Two things are pinned here, and both of them are things that cost money when wrong:
 *
 *   1. THE ORDER. Name, gate, email, assessment, phone. The email screen must never
 *      sit before the qualification gate, because the lead row is written there and a
 *      lead written before the verdict is a lead taken from somebody we then reject.
 *   2. THE REGISTRATION MOMENT. CompleteRegistration fires on the LAST lead screen.
 *      Firing it on the first would report a name with no way to contact it, and teach
 *      the ad account to find more of those.
 *
 * Plus the phone rule, which exists because nine-digit numbers were reaching the
 * Submissions table every day.
 *
 * No DB, no network, no build.
 */
import {
  splitSequence,
  splitFirstStep,
  splitNextStep,
  splitIsActive,
  registrationStep,
  hasNameScreen,
  type LeadSplitInput,
  type SplitStep,
} from "../src/features/assessment/flow/lead-split";
import { normalizePhone, isValidEmail } from "../src/lib/lead-format";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${String(actual)}, expected ${String(expected)})`}`);
}

function checkSeq(name: string, actual: SplitStep[], expected: SplitStep[]): void {
  check(name, actual.join(" > "), expected.join(" > "));
}

// ---------------------------------------------------------------------------
// The order
// ---------------------------------------------------------------------------

/** The configuration from the brief: audience, name, gate, email, 21 statements, phone. */
const full: LeadSplitInput = {
  splitMode: true,
  collectFirstName: true,
  collectLastName: true,
  collectEmail: true,
  collectMobile: true,
  collectProfession: false,
  audienceGate: true,
  qualificationLive: true,
  scoredQuestions: 21,
  optinFieldCount: 0,
  preResultFieldCount: 0,
};

console.log("\n--- screen order ---");

checkSeq("the full configuration runs in the agreed order", splitSequence(full), [
  "gate",
  "leadName",
  "qualify",
  "leadEmail",
  "questions",
  "leadPhone",
]);

check("a split run starts on the audience screen", splitFirstStep(full), "gate");
check("the gate is what the name screen leads to", splitNextStep(full, "leadName"), "qualify");
check("the email screen follows the gate", splitNextStep(full, "qualify"), "leadEmail");
check("the phone screen is last", splitNextStep(full, "leadPhone"), null);

// 🔴 The invariant the whole mode rests on.
const idxEmail = splitSequence(full).indexOf("leadEmail");
const idxGate = splitSequence(full).indexOf("qualify");
check("the email screen never precedes the gate", idxEmail > idxGate, true);

console.log("\n--- screens that collapse away ---");

checkSeq(
  "no audience gate: the run opens on the name screen",
  splitSequence({ ...full, audienceGate: false }),
  ["leadName", "qualify", "leadEmail", "questions", "leadPhone"],
);

checkSeq(
  "no qualification gate: email follows the name directly",
  splitSequence({ ...full, qualificationLive: false }),
  ["gate", "leadName", "leadEmail", "questions", "leadPhone"],
);

checkSeq(
  "no name collected: no empty name screen is rendered",
  splitSequence({ ...full, collectFirstName: false, collectLastName: false }),
  ["gate", "qualify", "leadEmail", "questions", "leadPhone"],
);

checkSeq(
  "a gate-only funnel still takes an email and a phone",
  splitSequence({ ...full, scoredQuestions: 0 }),
  ["gate", "leadName", "qualify", "leadEmail", "leadPhone"],
);

checkSeq(
  "pre-result fields sit between the questions and the phone",
  splitSequence({ ...full, preResultFieldCount: 2 }),
  ["gate", "leadName", "qualify", "leadEmail", "questions", "details", "leadPhone"],
);

check(
  "profession joins the name screen only when no audience gate asked for it",
  hasNameScreen({
    ...full,
    collectFirstName: false,
    collectLastName: false,
    collectProfession: true,
    audienceGate: false,
  }),
  true,
);
check(
  "profession does NOT join the name screen when the audience gate is on",
  hasNameScreen({
    ...full,
    collectFirstName: false,
    collectLastName: false,
    collectProfession: true,
    audienceGate: true,
  }),
  false,
);

console.log("\n--- split has to be usable at all ---");

check("split is inactive when the mode is off", splitIsActive({ ...full, splitMode: false }), false);
check(
  "split is inactive without an email: nothing would ever become a lead",
  splitIsActive({ ...full, collectEmail: false }),
  false,
);
checkSeq("an inactive split produces no screens", splitSequence({ ...full, splitMode: false }), []);

console.log("\n--- where CompleteRegistration fires ---");

check("the phone screen fires it when a phone is collected", registrationStep(full), "leadPhone");
check(
  "no phone collected: the email screen fires it instead",
  registrationStep({ ...full, collectMobile: false }),
  "leadEmail",
);
check("an inactive split fires nothing", registrationStep({ ...full, splitMode: false }), null);
// 🔴 Never the first screen.
check(
  "it is never the name screen while later lead screens exist",
  registrationStep(full) === "leadName",
  false,
);

// ---------------------------------------------------------------------------
// The phone and email rules
// ---------------------------------------------------------------------------

console.log("\n--- phone numbers ---");

function phoneValue(raw: string): string {
  const r = normalizePhone(raw);
  return r.ok ? r.value : `ERR`;
}

check("a plain ten-digit number passes", phoneValue("9356819176"), "9356819176");
check("spaces and dashes are ignored", phoneValue("93568-19176"), "9356819176");
check("a +91 prefix is stripped", phoneValue("+91 93568 19176"), "9356819176");
check("a bare 91 prefix is stripped", phoneValue("919356819176"), "9356819176");
check("a leading zero is stripped", phoneValue("09356819176"), "9356819176");

// 🔴 The case a strip-first implementation gets wrong.
check(
  "a valid number that happens to start 91 is kept whole",
  phoneValue("9198765432"),
  "9198765432",
);

check("nine digits is refused", phoneValue("935681917"), "ERR");
check("eleven digits is refused", phoneValue("93568191765"), "ERR");
check("nothing typed is refused", phoneValue(""), "ERR");
check("a landline-style leading 2 is refused", phoneValue("2256819176"), "ERR");
check("a leading 5 is refused", phoneValue("5356819176"), "ERR");
for (const d of ["6", "7", "8", "9"]) {
  check(`a number starting ${d} passes`, phoneValue(`${d}356819176`), `${d}356819176`);
}
check(
  "the nine-digit message names the length",
  (normalizePhone("935681917") as { error: string }).error,
  "Enter a 10-digit mobile number.",
);
check(
  "the wrong-leading-digit message names the digits",
  (normalizePhone("5356819176") as { error: string }).error,
  "An Indian mobile number starts with 6, 7, 8 or 9.",
);

console.log("\n--- email addresses ---");

check("an ordinary address passes", isValidEmail("ganganarayan.rns@gmail.com"), true);
check("a plus tag passes", isValidEmail("name+tag@example.co.in"), true);
check("surrounding spaces are trimmed", isValidEmail("  a@b.com  "), true);
check("no @ is refused", isValidEmail("nobody.example.com"), false);
check("no dot in the domain is refused", isValidEmail("a@localhost"), false);
check("an internal space is refused", isValidEmail("a b@c.com"), false);
check("empty is refused", isValidEmail(""), false);
check("two @ are refused", isValidEmail("a@b@c.com"), false);
check("a trailing dot is refused", isValidEmail("a@b.com."), false);

console.log(
  failures === 0
    ? "\nAll lead-split checks passed.\n"
    : `\n${failures} lead-split check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
