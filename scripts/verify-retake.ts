/**
 * Retake-lockout logic verification (no DB). Exercises the pure helpers in
 * src/features/assessment/lockout.ts: identifier normalization + the 3-policy
 * lockout decision with UTC date math.
 *
 *   npx tsx scripts/verify-retake.ts
 */
import { normalizeIdentifier, evaluateLockout } from "../src/features/assessment/lockout";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

const DAY = 86400000;
const now = new Date("2026-06-10T12:00:00.000Z");

console.log("Retake lockout verification\n");

// --- normalizeIdentifier ---
expect("email lowercased+trimmed", normalizeIdentifier("EMAIL", { email: "  User@X.com " }) === "user@x.com");
expect("email empty -> null", normalizeIdentifier("EMAIL", { email: "   " }) === null);
expect("email null -> null", normalizeIdentifier("EMAIL", { email: null }) === null);
expect("mobile digits only", normalizeIdentifier("MOBILE", { mobile: "+91 99999-99999" }) === "919999999999");
expect("mobile empty -> null", normalizeIdentifier("MOBILE", { mobile: "() - +" }) === null);
expect("email ignores mobile", normalizeIdentifier("EMAIL", { email: "a@b.com", mobile: "123" }) === "a@b.com");

// --- evaluateLockout: UNLIMITED ---
expect("UNLIMITED never locks", evaluateLockout("UNLIMITED", 15, new Date(now.getTime() - DAY), now).locked === false);

// --- NEVER ---
{
  const v = evaluateLockout("NEVER", 15, new Date(now.getTime() - 999 * DAY), now);
  expect("NEVER + prior completion locks", v.locked === true && (v as { nextAvailableAt: Date | null }).nextAvailableAt === null);
  expect("NEVER + no completion allows", evaluateLockout("NEVER", 15, null, now).locked === false);
}

// --- DELAYED ---
{
  const last = new Date(now.getTime() - 5 * DAY); // 5 days ago, 15-day window
  const v = evaluateLockout("DELAYED", 15, last, now);
  expect("DELAYED within window locks", v.locked === true);
  if (v.locked) {
    const expected = new Date(last.getTime() + 15 * DAY).toISOString();
    expect("DELAYED nextAvailableAt = last + days", v.nextAvailableAt?.toISOString() === expected, String(v.nextAvailableAt));
  }
  expect("DELAYED past window allows", evaluateLockout("DELAYED", 15, new Date(now.getTime() - 20 * DAY), now).locked === false);
  expect("DELAYED no completion allows", evaluateLockout("DELAYED", 15, null, now).locked === false);
  // boundary: exactly at the threshold -> allowed (now < next is false)
  expect("DELAYED exact boundary allows", evaluateLockout("DELAYED", 15, new Date(now.getTime() - 15 * DAY), now).locked === false);
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
