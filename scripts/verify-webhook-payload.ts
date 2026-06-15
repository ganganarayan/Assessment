/**
 * Webhook payload verification (no DB). Asserts the canonical envelope is stable
 * across every active event, contact is emitted in the flat CRM form
 * (contact_name / contact_email / contact_phone + contact.<custom_field>), URLs
 * are correct, and assessment metadata is uniform. Proves the preview
 * (buildSamplePayload) and real emission (buildEnvelope) share one shape.
 *
 *   npx tsx scripts/verify-webhook-payload.ts
 */
import { EventType } from "@prisma/client";
import {
  buildEnvelope,
  buildSamplePayload,
  normalizeAttribution,
} from "../src/lib/events/payload";
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

const TOP_FIXED = [
  "event",
  "timestamp",
  "source",
  "tenant",
  "submission",
  "contact_name",
  "contact_email",
  "contact_phone",
  "metadata",
];
const CONTACT_FIELDS = [
  "contact.utm_source",
  "contact.utm_medium",
  "contact.utm_campaign",
  "contact.utm_term",
  "contact.utm_content",
  "contact.fbclid",
  "contact.gclid",
  "contact.score",
  "contact.result_band",
  "contact.result_url",
  "contact.customer_id",
  "contact.scorePercent",
  "contact.scoreRaw",
  "contact.max",
];
const TOP = [...TOP_FIXED, ...CONTACT_FIELDS];
const META = ["assessmentId", "assessmentTitle", "assessmentSlug", "assessmentUrl", "resultUrl", "score", "resultBand", "categories"];

const scoredTypes = new Set<EventType>([
  EventType.ASSESSMENT_COMPLETED,
  EventType.RESULT_VIEWED,
  EventType.RESULT_GENERATED,
  EventType.RESULT_LINK_REQUESTED,
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
    lead: { firstName: "Ganesh", lastName: "Kumar", email: "g@example.com", mobile: "+919999999999" },
    attribution: { utm_source: "fb", utm_medium: "feed", utm_campaign: "q2", utm_content: "adA", fbclid: "x" },
    score: scored ? { total: 42, max: 60, percentage: 70 } : null,
    resultBand: scored ? { level: "HIGH", title: "High Emotional Load" } : null,
  };
  const env = buildEnvelope(type, input, BASE);
  const meta = env.metadata as Record<string, unknown>;

  expect(`${name} · top-level keys`, keysEq(env, TOP), JSON.stringify(Object.keys(env)));
  expect(`${name} · source`, env.source === "assess360");
  expect(`${name} · submission.id`, env.submission?.id === SID);
  expect(`${name} · tenant`, env.tenant?.slug === "acme");
  expect(`${name} · contact_name`, env.contact_name === "Ganesh Kumar", String(env.contact_name));
  expect(`${name} · contact_email`, env.contact_email === "g@example.com");
  expect(`${name} · contact_phone`, env.contact_phone === "+919999999999");
  expect(`${name} · contact.utm_source`, env["contact.utm_source"] === "fb", String(env["contact.utm_source"]));
  expect(`${name} · contact.utm_campaign`, env["contact.utm_campaign"] === "q2");
  expect(`${name} · contact.utm_term null`, env["contact.utm_term"] === null);
  expect(`${name} · contact.gclid null`, env["contact.gclid"] === null);
  expect(`${name} · metadata keys`, keysEq(meta, META), JSON.stringify(Object.keys(meta)));
  expect(`${name} · assessmentUrl`, meta.assessmentUrl === `${BASE}/a/${SLUG}`, String(meta.assessmentUrl));
  if (scored) {
    expect(`${name} · resultUrl`, meta.resultUrl === `${BASE}/a/${SLUG}/r/${SID}`, String(meta.resultUrl));
    expect(`${name} · score`, JSON.stringify(meta.score) === JSON.stringify({ total: 42, max: 60, percentage: 70 }));
    expect(`${name} · resultBand`, (meta.resultBand as { level: string }).level === "HIGH");
    expect(`${name} · contact.score`, env["contact.score"] === 70, String(env["contact.score"]));
    expect(`${name} · contact.result_band`, env["contact.result_band"] === "HIGH");
    expect(`${name} · contact.result_url`, env["contact.result_url"] === `${BASE}/a/${SLUG}/r/${SID}`);
  } else {
    expect(`${name} · resultUrl null`, meta.resultUrl === null);
    expect(`${name} · score null`, meta.score === null);
    expect(`${name} · resultBand null`, meta.resultBand === null);
    expect(`${name} · contact.score null`, env["contact.score"] === null);
    expect(`${name} · contact.result_band null`, env["contact.result_band"] === null);
    expect(`${name} · contact.result_url null`, env["contact.result_url"] === null);
  }

  const sample = buildSamplePayload(name, BASE);
  expect(`${name} · sample built`, sample !== null && keysEq(sample, TOP));
}

// contact_name composition.
{
  const solo = buildEnvelope(EventType.LEAD_CREATED, { submissionId: SID, lead: { firstName: "Solo" } }, BASE);
  expect("contact_name from single field", solo.contact_name === "Solo");
  const none = buildEnvelope(EventType.LEAD_CREATED, { submissionId: SID, lead: {} }, BASE);
  expect("contact_name empty -> null", none.contact_name === null && none.contact_email === null);
}

// normalizeAttribution: known keys only, trims, junk dropped, all-empty -> null.
{
  const norm = normalizeAttribution({ utm_source: "  fb  ", junk: "x", gclid: "" });
  expect(
    "normalizeAttribution sanitizes",
    norm !== null && norm.utm_source === "fb" && norm.gclid === null && !("junk" in norm),
  );
  expect("normalizeAttribution empty -> null", normalizeAttribution({}) === null);
  expect("normalizeAttribution non-object -> null", normalizeAttribution("nope") === null);
  expect("normalizeAttribution caps length", (normalizeAttribution({ utm_campaign: "a".repeat(999) })?.utm_campaign ?? "").length === 512);
}

// Per-category flat fields + metadata.categories on a real completed payload.
{
  const env = buildEnvelope(
    EventType.ASSESSMENT_COMPLETED,
    {
      submissionId: SID,
      customerId: "K7M2P9QX",
      tenant: { id: "t1", slug: "acme", name: "Acme" },
      assessment: { id: "a1", slug: SLUG, title: "X" },
      lead: { firstName: "G", email: "g@x.com" },
      score: { total: 42, max: 60, percentage: 70 },
      resultBand: { level: "HIGH", title: "High" },
      categories: [
        { name: "Sleep & Mental Recovery", score: 10, max: 12, band: "Strong", meaning: "good" },
        { name: "Stress Load", score: 3, max: 12, band: "Low", meaning: "watch" },
      ],
      resultUrl: "https://page.com/r?ref=fb&t=ABC",
    } satisfies EmitInput,
    BASE,
  );
  expect("categories flat band", env["contact.Sleep & Mental Recovery band"] === "Strong");
  expect("categories flat meaning", env["contact.Sleep & Mental Recovery meaning"] === "good");
  expect("categories flat score", env["contact.Stress Load score"] === 3);
  const cats = (env.metadata as { categories?: unknown[] }).categories;
  expect("metadata.categories present", Array.isArray(cats) && cats.length === 2);
  expect("contact.customer_id on completed", env["contact.customer_id"] === "K7M2P9QX");
  expect("contact.result_url is destination", env["contact.result_url"] === "https://page.com/r?ref=fb&t=ABC");
}

// scorePercent is a rounded integer (matches the read endpoint / connector).
{
  const env = buildEnvelope(
    EventType.ASSESSMENT_COMPLETED,
    { submissionId: SID, score: { total: 2, max: 3, percentage: 66.67 } },
    BASE,
  );
  expect("scorePercent rounds 66.67 -> 67", env["contact.scorePercent"] === 67);
}

// Unknown event → no sample (preview guards).
expect("unknown event → null sample", buildSamplePayload("nope.nope", BASE) === null);

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
