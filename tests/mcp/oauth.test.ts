import "./env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { checkAuthorizeParams, isAllowedRedirect, issueClientId, issueCode, readClientId, redeemCode } from "@/mcp/oauth/core";

const REDIRECT = "http://localhost:53123/callback";
const clientId = issueClientId({ redirect_uris: [REDIRECT, "https://claude.ai/api/mcp/auth_callback"], client_name: "Claude Code" });
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const params = (over: Record<string, string> = {}) => {
  const p: Record<string, string> = { response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "s1", ...over };
  return (k: string) => p[k] ?? null;
};

test("client id round-trips and refuses tampering", () => {
  assert.equal(readClientId(clientId)?.client_name, "Claude Code");
  assert.equal(readClientId(`${clientId}x`), null);
  assert.equal(readClientId("a360c_e30.sig"), null);
  assert.equal(readClientId("random"), null);
});

test("redirects: https anywhere, http only on loopback, never a fragment", () => {
  assert.equal(isAllowedRedirect("https://claude.ai/api/mcp/auth_callback"), true);
  assert.equal(isAllowedRedirect("http://127.0.0.1:9000/cb"), true);
  assert.equal(isAllowedRedirect("http://evil.example/cb"), false);
  assert.equal(isAllowedRedirect("https://x.example/cb#frag"), false);
  assert.equal(isAllowedRedirect("javascript:alert(1)"), false);
});

test("authorize params: valid request passes; unregistered redirect or missing PKCE is refused", () => {
  assert.equal(checkAuthorizeParams(params()).ok, true);
  assert.equal(checkAuthorizeParams(params({ redirect_uri: "http://localhost:1/other" })).ok, false);
  assert.equal(checkAuthorizeParams(params({ code_challenge: "" })).ok, false);
  assert.equal(checkAuthorizeParams(params({ code_challenge_method: "plain" })).ok, false);
  assert.equal(checkAuthorizeParams(params({ client_id: "forged" })).ok, false);
});

test("code exchange returns the key only with the right verifier, redirect and client", () => {
  const check = checkAuthorizeParams(params());
  assert.ok(check.ok);
  const code = issueCode("mcp_TEST_key", check.req);
  const base = { code, codeVerifier: verifier, redirectUri: REDIRECT, clientId };
  assert.deepEqual(redeemCode(base), { ok: true, key: "mcp_TEST_key" });
  assert.equal(redeemCode({ ...base, codeVerifier: randomBytes(32).toString("base64url") }).ok, false);
  assert.equal(redeemCode({ ...base, redirectUri: "https://claude.ai/api/mcp/auth_callback" }).ok, false);
  assert.equal(redeemCode({ ...base, clientId: issueClientId({ redirect_uris: [REDIRECT], client_name: "other" }) }).ok, false);
  const mid = Math.floor(code.length / 2);
  const flipped = `${code.slice(0, mid)}${code[mid] === "A" ? "B" : "A"}${code.slice(mid + 1)}`;
  assert.equal(redeemCode({ ...base, code: flipped }).ok, false);
});

test("the code does not carry the key in readable form, and expires after 5 minutes", () => {
  const check = checkAuthorizeParams(params());
  assert.ok(check.ok);
  const t0 = Date.now();
  const code = issueCode("mcp_SECRET_value", check.req, t0);
  assert.ok(!Buffer.from(code, "base64url").toString("utf8").includes("mcp_SECRET_value"));
  const base = { code, codeVerifier: verifier, redirectUri: REDIRECT, clientId };
  assert.equal(redeemCode(base, t0 + 4 * 60 * 1000).ok, true);
  assert.equal(redeemCode(base, t0 + 6 * 60 * 1000).ok, false);
});
