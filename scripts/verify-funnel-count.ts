/**
 * Pure harness for the IST day bucket the funnel-event counter is keyed on.
 *
 * The counter stores one row per assessment per event per IST day. If the bucket
 * drifted by a few hours, an evening firing would land on the previous day and the
 * Stats date range — which starts at IST midnight — would silently miss it. No DB,
 * no network: run it anywhere.
 */
import { istDayStart } from "../src/lib/date";

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const iso = (d: Date) => d.toISOString();

// 05:00 IST on 29 Sep 2026 = 2026-09-28T23:30Z. Its bucket is IST midnight that
// morning = 2026-09-28T18:30Z.
check(
  "early-morning IST time buckets to the same IST day",
  iso(istDayStart(new Date("2026-09-29T05:00:00+05:30"))) === "2026-09-28T18:30:00.000Z",
  iso(istDayStart(new Date("2026-09-29T05:00:00+05:30"))),
);

check(
  "late-evening IST time buckets to the same IST day",
  iso(istDayStart(new Date("2026-09-29T23:59:00+05:30"))) === "2026-09-28T18:30:00.000Z",
  iso(istDayStart(new Date("2026-09-29T23:59:00+05:30"))),
);

check(
  "one minute past IST midnight rolls to the next bucket",
  iso(istDayStart(new Date("2026-09-30T00:01:00+05:30"))) === "2026-09-29T18:30:00.000Z",
  iso(istDayStart(new Date("2026-09-30T00:01:00+05:30"))),
);

// A UTC-evening instant is already the NEXT IST day — the case a naive UTC bucket
// gets wrong, putting the firing outside a range that starts at IST midnight.
check(
  "19:00 UTC belongs to the next IST day",
  iso(istDayStart(new Date("2026-09-29T19:00:00.000Z"))) === "2026-09-29T18:30:00.000Z",
  iso(istDayStart(new Date("2026-09-29T19:00:00.000Z"))),
);

check("bucket is always IST midnight (18:30Z)", iso(istDayStart(new Date())).endsWith("T18:30:00.000Z"));

const a = istDayStart(new Date("2026-09-29T09:00:00+05:30"));
const b = istDayStart(new Date("2026-09-29T21:00:00+05:30"));
check("two firings on the same IST day share one bucket", a.getTime() === b.getTime());

// A day bucket must sit inside a Stats range for that day (IST midnight → 23:59:59.999).
const from = new Date("2026-09-29T00:00:00.000+05:30");
const to = new Date("2026-09-29T23:59:59.999+05:30");
const bucket = istDayStart(new Date("2026-09-29T14:00:00+05:30"));
check(
  "the bucket falls inside that day's Stats range",
  bucket.getTime() >= from.getTime() && bucket.getTime() <= to.getTime(),
);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exitCode = failures === 0 ? 0 : 1;
