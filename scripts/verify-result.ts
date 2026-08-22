/**
 * Pure checks for the result read path:
 *  - expiry is DISABLED (an old token still renders — never 410)
 *  - a token resolves to the person's NEWEST reading, with a safe fallback.
 * Run: npm run verify:result
 */
import { readResult, chooseServedRow, type ServableRow } from "../src/lib/result/read";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

// --- Expiry is off ----------------------------------------------------------
{
  const snap = { hello: "world" };
  const out = readResult({ resultSnapshot: snap });
  expect("a present snapshot returns 200", out.status === 200, `${out.status}`);
  expect("  body is the snapshot", out.status === 200 && out.body === snap);

  const missing = readResult({ resultSnapshot: null });
  expect("a null snapshot returns 404 (not blank 200)", missing.status === 404, `${missing.status}`);

  const none = readResult(null);
  expect("no row returns 404", none.status === 404, `${none.status}`);

  // The old shape carried resultTokenExpiresAt; readResult must ignore any age.
  const old = readResult({ resultSnapshot: snap }, Date.now() + 10 * 365 * 24 * 3600 * 1000);
  expect("a decade-old token still renders (no 410)", old.status === 200, `${old.status}`);
}

// --- Latest-only resolution -------------------------------------------------
{
  const tokenRow: ServableRow = { id: "tok", resultSnapshot: { v: 1 } };
  const newest: ServableRow = { id: "new", resultSnapshot: { v: 2 } };

  expect("serves the newest reading when present", chooseServedRow(tokenRow, newest)?.id === "new");
  expect("falls back to the token row when no newer reading", chooseServedRow(tokenRow, null)?.id === "tok");
  // Defensive: never serve a newest row that somehow has no snapshot.
  expect(
    "ignores a snapshot-less newest and falls back",
    chooseServedRow(tokenRow, { id: "empty", resultSnapshot: null })?.id === "tok",
  );
  expect("null token + null newest -> null", chooseServedRow<ServableRow>(null, null) === null);
  // Anonymous token (no person) still shows its own reading.
  expect("anonymous token shows its own row", chooseServedRow(tokenRow, null)?.resultSnapshot != null);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
