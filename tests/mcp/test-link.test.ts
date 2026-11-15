import "./env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mintTestToken, testLinkUrl, verifyTestToken } from "@/lib/funnel/test-link";
import { ACTION_CATALOG } from "@/mcp/actions/catalog.generated";

test("test link: a minted token verifies for its own assessment only", () => {
  const t = mintTestToken("asmt_123");
  assert.equal(verifyTestToken(t)?.assessmentId, "asmt_123");
  const [body] = t.split(".");
  const forgedBody = Buffer.from(`asmt_other.${Math.floor(Date.now() / 1000) + 3600}`).toString("base64url");
  assert.equal(verifyTestToken(`${forgedBody}.${t.split(".")[1]}`), null, "a signature cannot be moved to another funnel");
  assert.equal(verifyTestToken(`${body}.x${t.split(".")[1]!.slice(1)}`), null, "a tampered signature fails");
  assert.equal(verifyTestToken(""), null);
  assert.equal(verifyTestToken("nonsense"), null);
});

test("test link: expires after 7 days", () => {
  const now = Date.now();
  const t = mintTestToken("asmt_123", now);
  assert.ok(verifyTestToken(t, now + 6.9 * 86400_000));
  assert.equal(verifyTestToken(t, now + 7.1 * 86400_000), null);
});

test("test link: URL sits on the funnel's own origin under /a/<slug>/test/", () => {
  const { url } = testLinkUrl("https://quiz.example.com/", "my-funnel", "asmt_123");
  assert.match(url, /^https:\/\/quiz\.example\.com\/a\/my-funnel\/test\/[\w-]+\.[\w-]+$/);
});

test("clearing test runs is a destructive action that previews first", () => {
  const e = ACTION_CATALOG.find((x) => x.id === "assessment.test-runs.clearTestRuns");
  assert.equal(e?.kind, "write");
  assert.equal(e?.destructive, true);
  assert.equal(ACTION_CATALOG.find((x) => x.id === "assessment.test-runs.getTestLink")?.kind, "read");
});
