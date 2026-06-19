/**
 * VSL/token feature verification (no DB). Covers id generation, per-category
 * band mapping, the result snapshot, the read-endpoint outcome (404/410/200),
 * per-tenant CORS decisions, and the enriched webhook payload (customer_id +
 * categories + result_url, all as flat contact.* fields).
 *
 *   npx tsx scripts/verify-vsl.ts
 */
import { EventType } from "@prisma/client";
import { generateId, generateCustomerId, generateToken } from "../src/lib/ids";
import { mapCategoryResult, buildResultSnapshot, pct } from "../src/lib/result/snapshot";
import { originOf, isOriginAllowed } from "../src/lib/result/cors";
import { readResult } from "../src/lib/result/read";
import { buildEnvelope } from "../src/lib/events/payload";
import { type EmitInput } from "../src/features/events/types";

const BASE = "https://assess.applygitawisdom.com";
let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

console.log("VSL / token feature verification\n");

// (a) IDs: length + no-ambiguous alphabet.
{
  const big = generateId(2000);
  expect("generateCustomerId length 8", generateCustomerId().length === 8);
  expect("generateToken length 16", generateToken().length === 16);
  expect("id alphabet has no 0/O/1/I", !/[0O1I]/.test(big));
  expect("id alphabet only allowed chars", /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/.test(big));
}

// (b) Per-category band mapping.
{
  const bands = [
    { id: "b1", minScore: 0, maxScore: 49, displayOrder: 0, label: "Needs attention", meaning: "low" },
    { id: "b2", minScore: 50, maxScore: 100, displayOrder: 1, label: "Strong", meaning: "good" },
  ];
  expect("pct 10/12 -> 83", pct(10, 12) === 83);
  const strong = mapCategoryResult("Sleep & Mental Recovery", 10, 12, bands); // 83% -> Strong
  expect("category maps to Strong band", strong.band === "Strong" && strong.meaning === "good");
  expect("category carries raw score/max", strong.score === 10 && strong.max === 12);
  const none = mapCategoryResult("X", 1, 2, []); // no bands
  expect("no bands -> null band/meaning", none.band === null && none.meaning === null);
}

// (c) Snapshot shape.
{
  const snap = buildResultSnapshot({
    customerId: "K7M2P9QX",
    scoreRaw: 47,
    max: 60,
    scorePercent: 78,
    resultBand: "Balanced",
    resultSuggestion: "Keep it up.",
    categories: [{ name: "Sleep", score: 10, max: 12, band: "Strong", meaning: "good" }],
  });
  const keys = Object.keys(snap).sort().join(",");
  expect("snapshot top keys", keys === "categories,customerId,max,resultBand,resultSuggestion,scorePercent,scoreRaw", keys);
  expect("snapshot values", snap.scorePercent === 78 && snap.scoreRaw === 47 && snap.max === 60 && snap.customerId === "K7M2P9QX");
  expect("snapshot resultSuggestion", snap.resultSuggestion === "Keep it up.");
  expect("resultSuggestion defaults null", buildResultSnapshot({ customerId: "X", scoreRaw: 0, max: 0, scorePercent: 0, resultBand: null, categories: [] }).resultSuggestion === null);
}

// (d) Read outcome: 404 / 410 / 200.
{
  expect("read 404 (missing)", readResult(null, Date.now()).status === 404);
  expect("read 404 (no snapshot)", readResult({ resultSnapshot: null, resultTokenExpiresAt: null }, Date.now()).status === 404);
  const past = new Date(Date.now() - 1000);
  expect("read 410 (expired)", readResult({ resultSnapshot: { a: 1 }, resultTokenExpiresAt: past }, Date.now()).status === 410);
  const future = new Date(Date.now() + 60_000);
  const okOut = readResult({ resultSnapshot: { a: 1 }, resultTokenExpiresAt: future }, Date.now());
  expect("read 200 (valid) returns snapshot", okOut.status === 200 && JSON.stringify(okOut.body) === JSON.stringify({ a: 1 }));
}

// (e) CORS per-tenant.
{
  expect("originOf derives origin", originOf("https://page.com/results?x=1") === "https://page.com");
  expect("originOf bad url -> null", originOf("not a url") === null);
  expect("matching origin allowed", isOriginAllowed("https://page.com", ["https://page.com"]) === true);
  expect("non-matching origin denied", isOriginAllowed("https://evil.com", ["https://page.com"]) === false);
  expect("null targetOrigin denies all", isOriginAllowed("https://page.com", [null]) === false);
}

// (f) Enriched webhook payload (flat contact.* everything).
{
  const env = buildEnvelope(
    EventType.ASSESSMENT_COMPLETED,
    {
      submissionId: "sub1",
      customerId: "K7M2P9QX",
      tenant: { id: "t", slug: "acme", name: "Acme" },
      assessment: { id: "a", slug: "emotional-stability-assessment", title: "Emotional" },
      lead: { firstName: "Ganesh", lastName: "Kumar", email: "g@x.com", mobile: "+91" },
      score: { total: 42, max: 60, percentage: 70 },
      resultBand: { level: "HIGH", title: "High" },
      categories: [{ name: "Sleep & Mental Recovery", score: 10, max: 12, band: "Strong", meaning: "good" }],
      resultUrl: "https://page.com/results?t=ABC",
    } satisfies EmitInput,
    BASE,
  );
  expect("contact.customer_id", env["contact.customer_id"] === "K7M2P9QX");
  expect("contact.scorePercent", env["contact.scorePercent"] === 70);
  expect("contact.scoreRaw", env["contact.scoreRaw"] === 42);
  expect("contact.max", env["contact.max"] === 60);
  expect("contact.result_url is destination url", env["contact.result_url"] === "https://page.com/results?t=ABC");
  expect("per-category contact band", env["contact.Sleep & Mental Recovery band"] === "Strong");
  expect("per-category contact meaning", env["contact.Sleep & Mental Recovery meaning"] === "good");
  expect("per-category contact score", env["contact.Sleep & Mental Recovery score"] === 10);
  const cats = (env.metadata as { categories?: unknown[] }).categories;
  expect("metadata.categories present", Array.isArray(cats) && cats.length === 1);
}

// lead.created carries customer_id but no result fields.
{
  const env = buildEnvelope(
    EventType.LEAD_CREATED,
    { submissionId: "s", customerId: "K7M2P9QX", lead: { email: "g@x.com" } },
    BASE,
  );
  expect("lead.created contact.customer_id", env["contact.customer_id"] === "K7M2P9QX");
  expect("lead.created no result_url", env["contact.result_url"] === null);
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
