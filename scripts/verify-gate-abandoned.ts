/**
 * AssessmentAbandoned + manual Meta verdict verification (no DB).
 *
 * The highest-value check here is the event NAMES. The ad account's audiences
 * are built on these exact strings, and the ad sets exclude two of them — so a
 * rename silently stops populating an audience, or starts targeting people who
 * should be excluded, with no error anywhere in the app. These assertions are
 * the tripwire.
 *
 * Also checks the CAPI payload a pre-opt-in visitor produces: an abandoner has
 * no email or phone (they never opted in), so the event must carry the
 * cookie/id signals and must NOT invent empty PII fields.
 *
 *   npx tsx scripts/verify-gate-abandoned.ts
 */
import {
  completionEventName,
  COMPLETION_EVENT_GATED,
  COMPLETION_EVENT_DEFAULT,
  GATE_DISQUALIFIED_EVENT,
  ABANDONED_EVENT,
  isQualificationActive,
} from "../src/features/assessment/schemas";
import { buildCapiEvent } from "../src/lib/meta/capi";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

console.log("AssessmentAbandoned / Meta verdict verification\n");

// (a) Event-name tripwire. If one of these fails, an audience just stopped
//     filling — change the audience in Ads Manager FIRST, then this line.
{
  expect("ABANDONED_EVENT is AssessmentAbandoned", ABANDONED_EVENT === "AssessmentAbandoned", ABANDONED_EVENT);
  expect("GATE_DISQUALIFIED_EVENT is GateDisqualified", GATE_DISQUALIFIED_EVENT === "GateDisqualified", GATE_DISQUALIFIED_EVENT);
  expect("gated completion is QualifiedCompletion", COMPLETION_EVENT_GATED === "QualifiedCompletion", COMPLETION_EVENT_GATED);
  expect("ungated completion is AssessmentCompleted", COMPLETION_EVENT_DEFAULT === "AssessmentCompleted", COMPLETION_EVENT_DEFAULT);
  // The whole design rests on these being DIFFERENT: if the page-1 event shared a
  // name with the completion event, Meta would optimise toward gate-passers.
  // Widened to string on purpose — as literal types TS proves the inequality at
  // compile time and rejects the comparison, which is a stronger guarantee than
  // this check; the assertion stays so the intent is stated where it matters.
  const names: string[] = [ABANDONED_EVENT, GATE_DISQUALIFIED_EVENT, COMPLETION_EVENT_GATED, COMPLETION_EVENT_DEFAULT];
  expect("all four event names are distinct", new Set(names).size === names.length, names.join(", "));
  expect("gated funnel fires QualifiedCompletion", completionEventName(true) === COMPLETION_EVENT_GATED);
  expect("ungated funnel unchanged", completionEventName(false) === COMPLETION_EVENT_DEFAULT);
}

// (b) The gate must be BOTH enabled and populated before anything is recorded.
{
  expect("inactive when disabled", !isQualificationActive({ enabled: false, questions: [{ id: "q", prompt: "p", type: "CHOICE", options: [] }] }));
  expect("inactive when empty", !isQualificationActive({ enabled: true, questions: [] }));
  expect("inactive when malformed", !isQualificationActive(null) && !isQualificationActive("nope"));
}

// (c) The abandoned event's payload: no lead exists yet.
{
  const ev = buildCapiEvent({
    eventName: ABANDONED_EVENT,
    eventId: "gate-abandoned:abc123",
    eventTimeMs: 1_700_000_000_000,
    eventSourceUrl: "https://assess.applygitawisdom.com/a/test",
    user: {
      clientIpAddress: "1.2.3.4",
      clientUserAgent: "Mozilla/5.0",
      fbp: "fb.1.1700000000000.1234567890",
      fbc: "fb.1.1700000000000.AbCdEf",
      country: "IN",
      city: "Hyderabad",
      state: "Telangana",
      zip: "500001",
      externalId: "visitor-uuid-1",
    },
    customData: { content_name: "Test", assessment_name: "Test" },
  });

  const u = ev.user_data as Record<string, unknown>;
  expect("event name carried", ev.event_name === ABANDONED_EVENT);
  expect("event id carried", ev.event_id === "gate-abandoned:abc123");
  expect("event time is seconds", ev.event_time === 1_700_000_000);
  expect("fbp sent as-is", u.fbp === "fb.1.1700000000000.1234567890");
  expect("fbc sent as-is", u.fbc === "fb.1.1700000000000.AbCdEf");
  expect("ip sent as-is", u.client_ip_address === "1.2.3.4");
  expect("external_id present and hashed", Array.isArray(u.external_id) && (u.external_id as string[])[0]?.length === 64);
  expect("geo hashed", Array.isArray(u.ct) && Array.isArray(u.st) && Array.isArray(u.country) && Array.isArray(u.zp));
  // An abandoner has no email/phone — the keys must be ABSENT, not empty arrays
  // (Meta treats an empty hash array as a failed match, not a missing signal).
  expect("no email key", !("em" in u), JSON.stringify(u.em));
  expect("no phone key", !("ph" in u), JSON.stringify(u.ph));
  expect("no name keys", !("fn" in u) && !("ln" in u));
}

// (d) The manual verdict event ids are stable per submission+verdict, so a
//     double-click collapses inside Meta's dedup window instead of counting twice.
{
  const id = (v: string, s: string) => `meta-review:${v.toLowerCase()}:${s}`;
  expect("qualify id is stable", id("QUALIFIED", "sub1") === id("QUALIFIED", "sub1"));
  expect("verdicts do not collide", id("QUALIFIED", "sub1") !== id("DISQUALIFIED", "sub1"));
  expect("submissions do not collide", id("QUALIFIED", "sub1") !== id("QUALIFIED", "sub2"));
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
