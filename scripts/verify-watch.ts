/**
 * verify:watch - the VSL watch figure can never fall.
 *
 * WHY THIS EXISTS. VidaPulse counts per SESSION: every load of the result page opens a
 * new one starting at zero. The owner reads this number to decide whether a booked call
 * has already heard the fifteen minutes, and the emailed result link means people come
 * back to the page more than once.
 *
 * So the failure that matters is not an inaccurate number, it is a number that GOES
 * DOWN - twelve minutes yesterday, reopened today, left after twenty seconds, row now
 * reads twenty seconds. That figure gets believed once and distrusted forever after.
 *
 * Every check below is a way that could happen.
 *
 * No DB, no network, no build.
 */
import {
  mergeWatch,
  watchTotals,
  readWatchSessions,
  formatWatchClock,
  MAX_WATCH_SESSIONS,
} from "../src/features/assessment/watch/merge";

let failures = 0;

function expect(name: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}

function eq(name: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${String(actual)}, expected ${String(expected)})`}`);
}

console.log("VSL watch merge verification\n");

// --- one visit ----------------------------------------------------------------------
{
  let s = mergeWatch(null, { sessionId: "a", pct: 10, secs: 60 });
  eq("a first report is recorded", watchTotals(s).watchSeconds, 60);
  s = mergeWatch(s, { sessionId: "a", pct: 40, secs: 240 });
  eq("progress within a session replaces, never adds", watchTotals(s).watchSeconds, 240);
  eq("and the furthest point follows it", watchTotals(s).maxPct, 40);
  eq("one visit is one session", watchTotals(s).sessions, 1);
}

// --- 🔴 the regression this file exists for -----------------------------------------
{
  // Twelve minutes, yesterday.
  let s = mergeWatch(null, { sessionId: "day1", pct: 80, secs: 720 });
  // Reopened the emailed link today, left after twenty seconds. NEW session, from zero.
  s = mergeWatch(s, { sessionId: "day2", pct: 2, secs: 20 });
  const t = watchTotals(s);
  eq("a short second visit does NOT lower the furthest point", t.maxPct, 80);
  eq("and watch time ADDS rather than replacing", t.watchSeconds, 740);
  eq("two visits are two sessions", t.sessions, 2);
}

// --- out-of-order and backwards reports ---------------------------------------------
{
  let s = mergeWatch(null, { sessionId: "a", pct: 50, secs: 300 });
  // A late heartbeat overtaken by a newer one, or a seek backwards.
  s = mergeWatch(s, { sessionId: "a", pct: 20, secs: 120 });
  const t = watchTotals(s);
  eq("a late/stale report cannot pull the percentage back", t.maxPct, 50);
  eq("nor the seconds", t.watchSeconds, 300);
}

// --- a repeated report is not a double count ----------------------------------------
{
  let s = mergeWatch(null, { sessionId: "a", pct: 30, secs: 180 });
  for (let i = 0; i < 5; i++) s = mergeWatch(s, { sessionId: "a", pct: 30, secs: 180 });
  eq("five identical heartbeats still count once", watchTotals(s).watchSeconds, 180);
}

// --- junk cannot poison the total ----------------------------------------------------
{
  let s = mergeWatch(null, { sessionId: "a", pct: 999, secs: -5 });
  eq("an impossible percentage is clamped to 100", watchTotals(s).maxPct, 100);
  eq("negative seconds floor at zero", watchTotals(s).watchSeconds, 0);
  s = mergeWatch(s, { sessionId: "b", pct: Number.NaN, secs: Number.POSITIVE_INFINITY });
  expect("NaN and Infinity cannot reach the total", Number.isFinite(watchTotals(s).watchSeconds));
  const before = watchTotals(s).sessions;
  s = mergeWatch(s, { sessionId: "   ", pct: 50, secs: 50 });
  eq("a report with no session id is dropped", watchTotals(s).sessions, before);
  eq("malformed stored JSON reads as empty", Object.keys(readWatchSessions("nonsense")).length, 0);
  eq("an array reads as empty", Object.keys(readWatchSessions([1, 2])).length, 0);
}

// --- the map cannot grow without bound ------------------------------------------------
{
  let s = {};
  for (let i = 0; i < MAX_WATCH_SESSIONS + 20; i++) {
    s = mergeWatch(s, {
      sessionId: `s${i}`,
      pct: 1,
      secs: 1,
      at: new Date(Date.now() + i * 1000).toISOString(),
    });
  }
  const t = watchTotals(s);
  expect(
    "a reload loop cannot grow the column without limit",
    t.sessions <= MAX_WATCH_SESSIONS,
    String(t.sessions),
  );
  // The session being reported must survive its own pruning pass.
  const after = mergeWatch(s, { sessionId: "newest", pct: 99, secs: 10 });
  eq("the session just reported is never the one dropped", watchTotals(after).maxPct, 99);
}

// --- the clock a person reads ---------------------------------------------------------
eq("309 seconds reads as 5:09", formatWatchClock(309), "5:09");
eq("910 seconds reads as 15:10", formatWatchClock(910), "15:10");
eq("a round minute keeps two digits", formatWatchClock(120), "2:00");
eq("zero is 0:00", formatWatchClock(0), "0:00");
eq("a negative never renders a minus", formatWatchClock(-5), "0:00");

console.log(
  failures === 0 ? "\nAll watch checks passed.\n" : `\n${failures} watch check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
