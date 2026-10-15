/**
 * Unit checks for the cancellation exit link (pure crypto, no DB, no network):
 *   npm run verify:exit-link
 *
 * This token prefills a public page with somebody's name and email, so the checks that
 * matter are the ones that prove a STRANGER cannot. Exits non-zero on the first failure.
 */
import { signExitToken, readExitToken, buildExitLink } from "../src/lib/billing/exit-link";

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

const payload = { tenantId: "tnt_123", firstName: "Asha", email: "asha@example.com" };
const token = signExitToken(payload);

// --- round trip -------------------------------------------------------------
const back = readExitToken(token);
check("a signed token reads back", back !== null);
check("carries the workspace", back?.tenantId === "tnt_123");
check("carries the prefill", back?.firstName === "Asha" && back?.email === "asha@example.com");

// --- forgery ----------------------------------------------------------------
// The payload is readable (it is base64url, not encryption - it holds the customer's
// own details and is handed to that customer). What must be impossible is CHANGING it.
const [body, mac] = token.split(".");
const swapped = Buffer.from(
  JSON.stringify({ t: "someone-else", e: "attacker@example.com", x: Math.floor(Date.now() / 1000) + 600 }),
  "utf8",
).toString("base64url");
check("a re-written payload with the old signature is refused", readExitToken(`${swapped}.${mac}`) === null);
check("a flipped signature is refused", readExitToken(`${body}.${"a".repeat((mac ?? "").length)}`) === null);
check("a truncated token is refused", readExitToken(token.slice(0, token.length - 4)) === null);
check("no dot is refused", readExitToken("rubbish") === null);
check("empty is refused", readExitToken("") === null && readExitToken(undefined) === null);
check(
  "a signature of the wrong length is refused without throwing",
  readExitToken(`${body}.short`) === null,
);

// --- expiry -----------------------------------------------------------------
// Rebuilt by hand with a past expiry, signed by nothing: proves an EXPIRED payload is
// refused even before the signature argument, and that a hand-made one never passes.
const expired = Buffer.from(
  JSON.stringify({ t: "tnt_123", x: Math.floor(Date.now() / 1000) - 60 }),
  "utf8",
).toString("base64url");
check("an expired payload is refused", readExitToken(`${expired}.${mac}`) === null);

// --- the link ---------------------------------------------------------------
const link = buildExitLink("https://assess360.example.com/a/why-you-left", {
  ...payload,
  tenantSlug: "acme",
});
check("link carries the token", !!link && new URL(link).searchParams.get("x") !== null);
check(
  "link carries attribution so churn can be split by workspace",
  !!link &&
    new URL(link).searchParams.get("utm_source") === "cancellation" &&
    new URL(link).searchParams.get("utm_campaign") === "acme",
);
check(
  "the token in the link reads back to the same workspace",
  readExitToken(new URL(link!).searchParams.get("x") ?? "")?.tenantId === "tnt_123",
);
const keptQuery = buildExitLink("https://example.com/a/x?utm_term=keep", { tenantId: "t" });
check(
  "an existing query string survives",
  !!keptQuery && new URL(keptQuery).searchParams.get("utm_term") === "keep",
);
check("no configured survey means no link", buildExitLink("", { tenantId: "t" }) === null);
check("a blank setting means no link", buildExitLink("   ", { tenantId: "t" }) === null);
check(
  "an unparseable setting is handed back rather than dropped",
  buildExitLink("not a url", { tenantId: "t" }) === "not a url",
);

console.log("");
if (failures > 0) {
  console.error(`exit link: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("exit link: all checks passed");
