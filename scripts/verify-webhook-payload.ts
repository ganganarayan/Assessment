/**
 * Webhook payload verification (no DB). Asserts the canonical envelope is stable
 * across every active event, URLs are correct, lead/attribution keys are always
 * present, and assessment metadata is uniform. Proves the preview (buildSample
 * Payload) and real emission (buildEnvelope) share one shape.
 *
 *   npx tsx scripts/verify-webhook-payload.ts
 */
import { EventType } from "@prisma/client";
import { buildEnvelope, buildSamplePayload } from "../src/lib/events/payload";
import { ACTIVE_EVENT_TYPES, EVENT_NAME, type EmitInput } from "../src/features/events/types";

const BASE = "https://assess.applygitawisdom.com";
const SLUG = "emotional-stability-assessment";
const SID = "sub_test123";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
function expect(name: string, cond: boolean, detail = "") {
  if (cond) ok(name);
  else fail(name, detail);
}
const keysEq = (obj: object, expected: string[]) => {
  const got = Object.keys(obj).sort();
  const exp = [...expected].sort();
  return got.length === exp.length && got.every((k, i) => k === exp[i]);
};

const TOP = ["event", "timestamp", "source", "tenant", "submission", "lead", "attribution", "metadata"];
const LEAD = ["firstName", "lastName", "email", "mobile"];
const ATTR = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid", "gclid"];
const META = ["assessmentId", "assessmentTitle", "assessmentSlug", "assessmentUrl", "resultUrl", "score", "resultBand"];

const scoredTypes = new Set<EventType>([
  EventType.ASSESSMENT_COMPLETED,
  EventType.RESULT_VIEWED,
  EventType.RESULT_GENERATED,
]);

console.log("Webhook payload verification\n");

for (const type of ACTIVE_EVENT_TYPES) {
  const name = EVENT_NAME[type];
  const scored = scoredTypes.has(type);
  const input: EmitInput = {
    timestamp: "2026-01-01T00:00:00.000Z",
    submissionId: SID,
    tenant: { id: "t1", slug: "acme", name: "Acme" },
    assessment: { id: "a1", slug: SLUG, title: "Emotional Stability Assessment" },
    lead: { firstName: "Ganesh", lastName: null, email: "g@example.com", mobile: null },
    score: scored ? { total: 42, max: 60, percentage: 70 } : null,
    resultBand: scored ? { level: "HIGH", title: "High Emotional Load" } : null,
  };
  const env = buildEnvelope(type, input, BASE);
  const meta = env.metadata as Record<string, unknown>;

  expect(`${name} · top-level keys`, keysEq(env, TOP), JSON.stringify(Object.keys(env)));
  expect(`${name} · source`, env.source === "assess360");
  expect(`${name} · submission.id`, env.submission?.id === SID);
  expect(`${name} · tenant`, env.tenant?.slug === "acme");
  expect(`${name} · lead keys stable`, keysEq(env.lead, LEAD));
  expect(`${name} · lead null preserved`, env.lead.lastName === null && env.lead.mobile === null);
  expect(`${name} · attribution keys`, keysEq(env.attribution, ATTR));
  const attr = env.attribution as unknown as Record<string, unknown>;
  expect(`${name} · attribution all null`, ATTR.every((k) => attr[k] === null));
  expect(`${name} · metadata keys`, keysEq(meta, META), JSON.stringify(Object.keys(meta)));
  expect(`${name} · assessmentUrl`, meta.assessmentUrl === `${BASE}/a/${SLUG}`, String(meta.assessmentUrl));
  if (scored) {
    expect(`${name} · resultUrl`, meta.resultUrl === `${BASE}/a/${SLUG}/r/${SID}`, String(meta.resultUrl));
    expect(`${name} · score`, JSON.stringify(meta.score) === JSON.stringify({ total: 42, max: 60, percentage: 70 }));
    expect(`${name} · resultBand`, (meta.resultBand as { level: string }).level === "HIGH");
  } else {
    expect(`${name} · resultUrl null`, meta.resultUrl === null);
    expect(`${name} · score null`, meta.score === null);
    expect(`${name} · resultBand null`, meta.resultBand === null);
  }

  // Preview uses the same shape.
  const sample = buildSamplePayload(name, BASE);
  expect(`${name} · sample built`, sample !== null && keysEq(sample, TOP));
}

// Attribution pass-through (when capture is wired later).
{
  const env = buildEnvelope(
    EventType.LEAD_CREATED,
    { submissionId: SID, attribution: { utm_source: "facebook", fbclid: "abc" } },
    BASE,
  );
  expect("attribution pass-through", env.attribution.utm_source === "facebook" && env.attribution.fbclid === "abc" && env.attribution.gclid === null);
}

// Unknown event → no sample (preview guards).
expect("unknown event → null sample", buildSamplePayload("nope.nope", BASE) === null);

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
