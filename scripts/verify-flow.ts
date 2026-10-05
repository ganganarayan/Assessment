/**
 * verify:flow - the funnel's ENDING, asserted as a pure function.
 *
 * The precedence between signup, result pages, payment and destination used to live
 * only as the order of `if`s inside the runner's completion callback, where nothing
 * could check it and anything that needed to know the ending early had to guess. This
 * pins both the order and the one thing that reads it, the post-Submit countdown.
 *
 * No DB, no network, no build. Runs in the same breath as the other verify scripts.
 */
import { terminalStage, waitSeconds, type FlowInput, type TerminalStage } from "../src/features/assessment/flow/stages";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${String(actual)}, expected ${String(expected)})`}`);
}

const base: FlowInput = {
  platformSignup: false,
  pageCount: 0,
  paidMode: false,
  vslCountdownSeconds: 10,
};

const cases: { name: string; input: FlowInput; stage: TerminalStage; wait: number }[] = [
  {
    name: "plain funnel ends at the destination and keeps its countdown",
    input: { ...base },
    stage: "DESTINATION",
    wait: 10,
  },
  {
    name: "destination countdown of 0 means redirect immediately",
    input: { ...base, vslCountdownSeconds: 0 },
    stage: "DESTINATION",
    wait: 0,
  },
  {
    name: "signup handoff never counts down",
    input: { ...base, platformSignup: true },
    stage: "SIGNUP",
    wait: 0,
  },
  {
    name: "signup wins over result pages and payment",
    input: { ...base, platformSignup: true, pageCount: 3, paidMode: true },
    stage: "SIGNUP",
    wait: 0,
  },
  {
    name: "result pages come before payment, and never count down",
    input: { ...base, pageCount: 2, paidMode: true },
    stage: "RESULT_PAGES",
    wait: 0,
  },
  {
    name: "paid with no pages goes to payment, and never counts down",
    input: { ...base, paidMode: true },
    stage: "PAYMENT",
    wait: 0,
  },
];

for (const c of cases) {
  check(`${c.name} [stage]`, terminalStage(c.input), c.stage);
  check(`${c.name} [wait]`, waitSeconds(c.input), c.wait);
}

// Defensive: a corrupt/negative stored value must never produce a negative or NaN
// timer, which would render as a stuck screen rather than a fast one.
check(
  "negative countdown clamps to 0",
  waitSeconds({ ...base, vslCountdownSeconds: -5 }),
  0,
);
check(
  "NaN countdown clamps to 0",
  waitSeconds({ ...base, vslCountdownSeconds: Number.NaN }),
  0,
);
check(
  "fractional countdown floors",
  waitSeconds({ ...base, vslCountdownSeconds: 7.9 }),
  7,
);

console.log(failures === 0 ? "\nverify:flow OK" : `\nverify:flow FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
