/**
 * Qualification-gate rejection-flag verification (no DB). Exercises the pure helper in
 * src/lib/gate-flag.ts, which holds two decisions that must stay independent:
 *
 *   1. Is the visitor locked out?       -> permanent, for as long as the flag survives.
 *   2. Should GateDisqualified fire?    -> only when the exclusion audience needs it.
 *
 * Tying those together is the original bug in both directions: firing on every revisit
 * inflated Meta's count far past the number of people rejected, and expiring the
 * lockout would walk a rejected visitor back into the funnel.
 *
 *   npx tsx scripts/verify-gate-flag.ts
 */
import {
  GATE_DQ_AUDIENCE_REFRESH_MS,
  gateFlagKey,
  readGateRejection,
  shouldFireDisqualified,
  stampGateRejectionFired,
  writeGateRejection,
} from "../src/lib/gate-flag";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

console.log("Gate rejection flag verification\n");

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

// --- Key scoping: one funnel's rejection must never block another ---
expect("key is per-assessment", gateFlagKey("gita-clarity") === "gate_dq:gita-clarity");
expect("key differs per slug", gateFlagKey("a") !== gateFlagKey("b"));

// --- Absent / unreadable flags mean "not rejected" ---
for (const [label, raw] of [
  ["null", null],
  ["undefined", undefined],
  ["empty string", ""],
  ["garbage", "not json"],
  ["JSON non-object", "42"],
  ["JSON null", "null"],
  ["object without `at`", '{"x":1}'],
  ["non-numeric `at`", '{"at":"yesterday"}'],
  ["null `at`", '{"at":null}'],
] as const) {
  expect(`${label} reads as no rejection`, readGateRejection(raw) === null);
}

// --- LOCKOUT IS PERMANENT: a stored rejection never expires ---
const fresh = writeGateRejection(NOW);
expect("a fresh rejection is stored", readGateRejection(fresh)?.at === NOW);
expect("fresh rejection has not been reported yet", readGateRejection(fresh)?.firedAt === null);
for (const days of [1, 31, 200, 3650]) {
  expect(
    `still locked out after ${days} day(s)`,
    readGateRejection(writeGateRejection(NOW - days * DAY)) !== null,
    "an expiring lockout walks a rejected visitor back into the funnel",
  );
}

// --- The legacy "1" flag: honoured as a real, undated rejection ---
const legacy = readGateRejection("1");
expect('legacy "1" still locks the visitor out', legacy !== null);
expect('legacy "1" has an unknown rejection date', legacy?.at === 0);
expect('legacy "1" has no recorded send', legacy?.firedAt === null);
expect(
  'legacy "1" fires once, since Meta may never have received it',
  legacy !== null && shouldFireDisqualified(legacy, NOW),
);

// --- FIRING IS SEPARATE: only when the audience needs it ---
const unreported = readGateRejection(writeGateRejection(NOW));
expect("fires when never reported", unreported !== null && shouldFireDisqualified(unreported, NOW));

const justFired = readGateRejection(stampGateRejectionFired({ at: NOW, firedAt: null }, NOW));
expect("records the send", justFired?.firedAt === NOW);
expect("does NOT re-fire on an immediate revisit", justFired !== null && !shouldFireDisqualified(justFired, NOW));
expect(
  "does NOT re-fire a day later",
  justFired !== null && !shouldFireDisqualified(justFired, NOW + DAY),
  "re-firing per visit is what inflated Meta's count",
);
expect(
  "does NOT re-fire just inside the refresh window",
  justFired !== null && !shouldFireDisqualified(justFired, NOW + GATE_DQ_AUDIENCE_REFRESH_MS - 1),
);
expect(
  "DOES re-fire once the refresh window is reached",
  justFired !== null && shouldFireDisqualified(justFired, NOW + GATE_DQ_AUDIENCE_REFRESH_MS),
  "without a refresh the visitor ages out of the exclusion audience and sees the ad again",
);

// --- Stamping keeps the original rejection date ---
const restamped = readGateRejection(stampGateRejectionFired({ at: NOW - 90 * DAY, firedAt: NOW - 90 * DAY }, NOW));
expect("re-stamping preserves the original rejection date", restamped?.at === NOW - 90 * DAY);
expect("re-stamping updates the send time", restamped?.firedAt === NOW);
const stampedLegacy = readGateRejection(stampGateRejectionFired({ at: 0, firedAt: null }, NOW));
expect("stamping a legacy flag gives it a real date", stampedLegacy?.at === NOW);

// --- The refresh window must stay inside Meta's audience retention (180 days) ---
expect(
  "refresh interval is well inside Meta's 180-day retention",
  GATE_DQ_AUDIENCE_REFRESH_MS < 180 * DAY,
  `${GATE_DQ_AUDIENCE_REFRESH_MS / DAY} days would let membership lapse before renewal`,
);
expect("refresh interval is 60 days", GATE_DQ_AUDIENCE_REFRESH_MS === 60 * DAY);

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
