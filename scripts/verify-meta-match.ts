/**
 * Pure-logic checks for the Meta-match lookup + token hashing. No DB / no env.
 * Run: npx tsx scripts/verify-meta-match.ts
 */
import {
  normalizeEmail,
  phoneDigits,
  phoneLast10,
  buildMetaMatchResponse,
  type MetaMatchRecord,
} from "../src/lib/meta-match/lookup";
import { hashApiToken, generateApiToken } from "../src/lib/api-auth/token";
import { fbcCreationMs } from "../src/lib/meta/capi";

let failures = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) {
    failures++;
    console.error(`FAIL ${name}\n  got:  ${g}\n  want: ${w}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

// --- normalization ---------------------------------------------------------
// --- fbc creation time (real fbclid timestamp, MILLISECONDS) ---------------
eq("fbc creation ms from cookie", fbcCreationMs("fb.1.1751541600000.IwAR0xyz"), 1751541600000);
eq("fbc missing -> null (fallback to opt-in)", fbcCreationMs(null), null);
eq("fbc malformed -> null", fbcCreationMs("fb.1."), null);

eq("email trims + lowercases", normalizeEmail("  Buyer@Example.COM "), "buyer@example.com");
eq("email empty -> null", normalizeEmail("   "), null);
eq("phone digits only", phoneDigits("+91 98765-43210"), "919876543210");
eq("phone last10", phoneLast10("+91 98765 43210"), "9876543210");
eq("phone last10 short kept", phoneLast10("12345"), "12345");
eq("phone none -> null", phoneLast10("abc"), null);

// --- response shaping ------------------------------------------------------
const startedAt = new Date("2026-07-01T12:00:00Z");
const rec: MetaMatchRecord = {
  leadEmail: "buyer@example.com",
  leadMobile: "+919876543210",
  clientIp: "49.36.1.2",
  userAgent: "Mozilla/5.0",
  fbp: "fb.1.1751020000.1234567890",
  fbc: null,
  fbclidTimestamp: 1751020800000,
  startedAt,
  attribution: { utm_source: "fb", utm_medium: "paid_social", fbclid: "IwAR0xyz", gclid: "" },
};
const out = buildMetaMatchResponse(rec);
eq("found true", out.found, true);
eq("email passthrough", out.email, "buyer@example.com");
eq("phone passthrough", out.phone, "+919876543210");
eq("fbclid from attribution", out.fbclid, "IwAR0xyz");
eq("fbclid_timestamp (ms passthrough)", out.fbclid_timestamp, 1751020800000);
eq("optin_timestamp from startedAt (ms)", out.optin_timestamp, startedAt.getTime());
eq("utm_source", out.utm_source, "fb");
eq("empty utm -> null", out.utm_campaign, null);
eq("fbc null passthrough", out.fbc, null);

const notFound = buildMetaMatchResponse(null);
eq("not found flag", notFound.found, false);
eq("not found stable shape has email key", Object.prototype.hasOwnProperty.call(notFound, "email"), true);
eq("not found email null", notFound.email, null);
eq("not found optin_timestamp null", notFound.optin_timestamp, null);

// --- token hashing ---------------------------------------------------------
eq("hash deterministic", hashApiToken("mm_ABC234_secret") === hashApiToken("mm_ABC234_secret"), true);
eq("hash differs by input", hashApiToken("a") !== hashApiToken("b"), true);
const gen = generateApiToken("meta_match");
eq("minted plaintext starts with prefix", gen.plaintext.startsWith(gen.prefix + "_"), true);
eq("minted prefix scoped mm_", gen.prefix.startsWith("mm_"), true);
eq("minted hash matches plaintext", gen.tokenHash === hashApiToken(gen.plaintext), true);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll meta-match checks passed.");
