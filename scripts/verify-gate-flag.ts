/**
 * Qualification-gate rejection-flag verification (no DB). Exercises the pure helper in
 * src/lib/gate-flag.ts, which decides how long a gate rejection keeps a visitor on the
 * exit page — and therefore whether the GateDisqualified pixel event re-fires.
 *
 * The behaviour that matters: a rejection expires (a mis-click must not shut a browser
 * out of the funnel forever), and the legacy permanent "1" flag reads as expired so the
 * cohort locked out before the TTL existed gets one clean retry.
 *
 *   npx tsx scripts/verify-gate-flag.ts
 */
import { GATE_DQ_TTL_MS, gateFlagKey, readGateRejection, writeGateRejection } from "../src/lib/gate-flag";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

console.log("Gate rejection flag verification\n");

const NOW = 1_800_000_000_000;

// --- Key scoping: one funnel's rejection must never block another ---
expect("key is per-assessment", gateFlagKey("gita-clarity") === "gate_dq:gita-clarity");
expect("key differs per slug", gateFlagKey("a") !== gateFlagKey("b"));

// --- Absent / unreadable flags mean "not rejected" ---
expect("null reads as no rejection", readGateRejection(null, NOW) === null);
expect("undefined reads as no rejection", readGateRejection(undefined, NOW) === null);
expect("empty string reads as no rejection", readGateRejection("", NOW) === null);
expect("garbage reads as no rejection", readGateRejection("not json", NOW) === null);
expect("JSON non-object reads as no rejection", readGateRejection("42", NOW) === null);
expect("JSON null reads as no rejection", readGateRejection("null", NOW) === null);
expect("object without `at` reads as no rejection", readGateRejection('{"x":1}', NOW) === null);
expect("non-numeric `at` reads as no rejection", readGateRejection('{"at":"yesterday"}', NOW) === null);
expect("NaN `at` reads as no rejection", readGateRejection('{"at":null}', NOW) === null);

// --- The legacy permanent flag: deliberately treated as expired ---
expect(
  'legacy "1" reads as expired (one clean retry)',
  readGateRejection("1", NOW) === null,
  "a permanent legacy flag would keep the pre-fix cohort locked out forever",
);

// --- A fresh rejection is remembered ---
const fresh = writeGateRejection(NOW);
expect("fresh rejection round-trips", readGateRejection(fresh, NOW) === NOW, `got ${readGateRejection(fresh, NOW)}`);
expect(
  "rejection still holds just inside the TTL",
  readGateRejection(fresh, NOW + GATE_DQ_TTL_MS - 1) === NOW,
);

// --- ...and expires, so the visitor re-answers the gate ---
expect("rejection expires exactly at the TTL", readGateRejection(fresh, NOW + GATE_DQ_TTL_MS) === null);
expect("rejection expires past the TTL", readGateRejection(fresh, NOW + GATE_DQ_TTL_MS * 2) === null);

// --- A clock that moved backwards must not resurrect an expired flag as "future" ---
expect("future timestamp is still treated as a live rejection", readGateRejection(writeGateRejection(NOW + 5_000), NOW) === NOW + 5_000);

// --- The TTL is the documented 30 days ---
expect("TTL is 30 days", GATE_DQ_TTL_MS === 30 * 24 * 60 * 60 * 1000, `got ${GATE_DQ_TTL_MS}ms`);

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
