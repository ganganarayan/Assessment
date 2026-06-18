/**
 * Meta Conversions API feature verification (no DB, no network). Covers PII
 * normalization + SHA-256 hashing and the pure CAPI event payload builder
 * (hashed-not-plaintext, arrays, event_id/event_time/action_source, omitted
 * empty fields, custom_data passthrough).
 *
 *   npx tsx scripts/verify-capi.ts
 */
import { sha256Hex, hashEmail, hashPhone, hashName } from "../src/lib/meta/hash";
import { buildCapiEvent, resolveCapiConfig, DEFAULT_GRAPH_API_VERSION } from "../src/lib/meta/capi";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

console.log("Meta CAPI feature verification\n");

// (a) Known SHA-256 vector.
{
  // sha256("hello") — well-known test vector.
  const v = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
  expect("sha256Hex('hello')", sha256Hex("hello") === v, sha256Hex("hello"));
}

// (b) Normalization before hashing: email lowercased+trimmed, phone digits-only.
{
  const a = hashEmail("  Foo@Bar.COM ");
  const b = hashEmail("foo@bar.com");
  expect("email normalized (case/space)", a === b && a === sha256Hex("foo@bar.com"));

  const p = hashPhone("+91 (987) 654-3210");
  expect("phone stripped to digits", p === sha256Hex("919876543210"), String(p));

  const n = hashName("  Ganesh ");
  expect("name normalized (case/space)", n === sha256Hex("ganesh"));

  expect("empty -> null", hashEmail("") === null && hashPhone("  ") === null && hashName(null) === null);
  expect("phone with no digits -> null", hashPhone("+-() ") === null);
}

// (c) Payload builder: hashed (not plaintext), arrays, core fields, omissions.
{
  const ev = buildCapiEvent({
    eventName: "AssessmentCompleted",
    eventId: "evt-123",
    eventTimeMs: 1_700_000_000_000,
    eventSourceUrl: "https://assess.applygitawisdom.com/a/x",
    user: {
      email: "g@x.com",
      phone: "+91 98765 43210",
      firstName: "Ganesh",
      lastName: null,
      clientIpAddress: "1.2.3.4",
      clientUserAgent: "UA/1.0",
      fbp: "fb.1.x",
      fbc: null,
    },
    customData: { content_name: "Emotional" },
  });

  expect("event_name", ev.event_name === "AssessmentCompleted");
  expect("event_id", ev.event_id === "evt-123");
  expect("event_time is seconds", ev.event_time === 1_700_000_000);
  expect("action_source website", ev.action_source === "website");
  expect("event_source_url", ev.event_source_url === "https://assess.applygitawisdom.com/a/x");

  const u = ev.user_data;
  expect("em is hashed array", Array.isArray(u.em) && u.em[0] === sha256Hex("g@x.com"));
  expect("em is NOT plaintext", JSON.stringify(ev).indexOf("g@x.com") === -1);
  expect("ph hashed (digits only)", u.ph?.[0] === sha256Hex("919876543210"));
  expect("fn hashed", u.fn?.[0] === sha256Hex("ganesh"));
  expect("ln omitted (null)", u.ln === undefined);
  expect("ip/ua/fbp passthrough", u.client_ip_address === "1.2.3.4" && u.client_user_agent === "UA/1.0" && u.fbp === "fb.1.x");
  expect("fbc omitted (null)", u.fbc === undefined);
  expect("custom_data passthrough", ev.custom_data?.content_name === "Emotional");
}

// (d) Minimal event: no user signals, no custom data, no source url.
{
  const ev = buildCapiEvent({
    eventName: "CompleteRegistration",
    eventId: "e2",
    eventTimeMs: 2000,
    user: {},
  });
  expect("event_time floors", ev.event_time === 2);
  expect("empty user_data object", Object.keys(ev.user_data).length === 0);
  expect("no custom_data when empty", ev.custom_data === undefined);
  expect("no event_source_url when absent", ev.event_source_url === undefined);
}

// (e) Config resolution: the "inert until configured" decision (pure).
{
  expect("no token -> null (inert)", resolveCapiConfig({ datasetId: "123" }) === null);
  expect("token but no dataset/pixel -> null", resolveCapiConfig({ accessToken: "T" }) === null);

  const viaDataset = resolveCapiConfig({ accessToken: "T", datasetId: "DS" });
  expect("token + dataset -> config", viaDataset?.datasetId === "DS" && viaDataset?.accessToken === "T");
  expect("version defaults", viaDataset?.version === DEFAULT_GRAPH_API_VERSION);
  expect("testEventCode defaults null", viaDataset?.testEventCode === null);

  const viaPixel = resolveCapiConfig({ accessToken: "T", pixelId: "PX" });
  expect("dataset falls back to pixel id", viaPixel?.datasetId === "PX");

  const explicit = resolveCapiConfig({ accessToken: "T", datasetId: "DS", pixelId: "PX" });
  expect("explicit dataset wins over pixel", explicit?.datasetId === "DS");

  const full = resolveCapiConfig({ accessToken: "T", datasetId: "DS", version: "v22.0", testEventCode: "TEST123" });
  expect("version override", full?.version === "v22.0");
  expect("testEventCode passthrough", full?.testEventCode === "TEST123");
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
