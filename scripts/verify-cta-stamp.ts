/**
 * CTA click identity verification (no DB). Covers the rule that decides which
 * links get a respondent's ids stamped onto them, and the CRM field that lets a
 * page with no ids of its own supply them.
 *
 * Why this matters: a CTA click can only be traced back to a respondent if the
 * ids are IN THE URL. The Referer header cannot carry them — our own CTA anchors
 * are rel="noreferrer", page builders set referrer policies, and the Facebook /
 * Instagram in-app browsers strip it outright. Getting the stamp wrong is
 * silent: clicks keep working, they just arrive anonymous.
 *
 *   npx tsx scripts/verify-cta-stamp.ts
 */
import { EventType } from "@prisma/client";
import { isVidapulseCtaUrl, stampVidapulseCtaUrl } from "../src/lib/vidapulse";
import { buildCustomPayload, type CustomFieldData } from "../src/lib/crm/custom-fields";
import { buildEnvelope } from "../src/lib/events/payload";

const BASE = "https://assess.applygitawisdom.com";
let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

console.log("CTA click identity verification\n");

const CID = "K7M2P9QX";
const TOK = "ABCD2345EFGH6789";
const LINK = "https://app.vidapulse.io/api/analytics/cta/link/aaf0d3a5-3310-432a-be0c-6419c15d5e2c";
const VIDEO = "https://app.vidapulse.io/api/analytics/cta/27bbe6ad-95c9-4ee2-835a-c824e681b86b?to=https%3A%2F%2Fcal.com";

// (a) Which URLs are CTA tracking links at all.
{
  expect("named CTA link matches", isVidapulseCtaUrl(LINK));
  expect("video CTA link matches", isVidapulseCtaUrl(VIDEO));
  expect("custom host still matches", isVidapulseCtaUrl("https://video.myclinic.com/api/analytics/cta/link/x"));
  expect("ordinary link does not", !isVidapulseCtaUrl("https://cal.com/book/abc"));
  expect("lookalike path does not", !isVidapulseCtaUrl("https://site.com/blog/api/analytics/other"));
  expect("relative url does not", !isVidapulseCtaUrl("/thanks"));
  expect("blank does not", !isVidapulseCtaUrl("") && !isVidapulseCtaUrl(null));
}

// (b) Stamping: only CTA links, both ids, nothing else touched.
{
  const stamped = stampVidapulseCtaUrl(LINK, CID, TOK) ?? "";
  const u = new URL(stamped);
  expect("token is stamped", u.searchParams.get("t") === TOK);
  expect("cid is stamped", u.searchParams.get("cid") === CID);
  expect("carrier is recorded", u.searchParams.get("vpsrc") === "url");
  expect("path is untouched", u.pathname === new URL(LINK).pathname);

  const plain = "https://cal.com/book/abc?utm_source=ig";
  expect("ordinary link is byte-identical", stampVidapulseCtaUrl(plain, CID, TOK) === plain);

  const relative = "/a/test/r/123";
  expect("relative link is byte-identical", stampVidapulseCtaUrl(relative, CID, TOK) === relative);

  expect("null in, null out", stampVidapulseCtaUrl(null, CID, TOK) === null);
  expect("no ids means no rewrite", stampVidapulseCtaUrl(LINK, null, null) === LINK);
}

// (c) Partial identity — an older link may carry only one of the two.
{
  const tokenOnly = new URL(stampVidapulseCtaUrl(LINK, null, TOK) ?? "");
  expect("token alone still stamps", tokenOnly.searchParams.get("t") === TOK);
  expect("token alone adds no empty cid", tokenOnly.searchParams.get("cid") === null);

  const cidOnly = new URL(stampVidapulseCtaUrl(LINK, CID, null) ?? "");
  expect("cid alone still stamps", cidOnly.searchParams.get("cid") === CID);
  expect("cid alone adds no empty token", cidOnly.searchParams.get("t") === null);
}

// (d) An id the owner already put on the link wins — we never overwrite it.
{
  const preset = `${LINK}?t=THEIRTOKEN&cid=THEIRCID`;
  const u = new URL(stampVidapulseCtaUrl(preset, CID, TOK) ?? "");
  expect("existing token is preserved", u.searchParams.get("t") === "THEIRTOKEN");
  expect("existing cid is preserved", u.searchParams.get("cid") === "THEIRCID");
}

// (e) The link's own query survives the stamp (a video CTA carries ?to=).
{
  const u = new URL(stampVidapulseCtaUrl(VIDEO, CID, TOK) ?? "");
  expect("destination param survives", u.searchParams.get("to") === "https://cal.com");
  expect("video link is stamped too", u.searchParams.get("t") === TOK);
}

// (f) The CRM carries the token, so a page with no ids can supply them itself.
{
  const data: CustomFieldData = {
    name: "Test", email: "t@x.com", phone: "9000000000",
    diagnosis: "Strained", scorePercent: 55, bandLevel: "MEDIUM",
    scoreRaw: 33, scoreMax: 60,
    customerId: CID, resultToken: TOK,
    resultUrl: `${BASE}/a/test/r/1`, aiStatement: null, profession: null,
  };
  const payload = buildCustomPayload(["contact.result_token", "contact.customer_id"], "score_updated", data);
  expect("CRM payload carries the token", payload["contact.result_token"] === TOK);
  expect("CRM payload carries the cid", payload["contact.customer_id"] === CID);

  const env = buildEnvelope(
    EventType.ASSESSMENT_COMPLETED,
    { submissionId: "s", customerId: CID, resultToken: TOK, lead: { email: "g@x.com" } },
    BASE,
  );
  expect("webhook envelope carries the token", env["contact.result_token"] === TOK);

  const noToken = buildEnvelope(
    EventType.LEAD_CREATED,
    { submissionId: "s", customerId: CID, lead: { email: "g@x.com" } },
    BASE,
  );
  expect("absent token is null, not undefined", noToken["contact.result_token"] === null);
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
