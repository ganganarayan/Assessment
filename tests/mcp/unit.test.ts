import "./env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { toJsonSchema } from "@/mcp/core/json-schema";
import { canonicalJson, checkPreviewToken, issuePreviewToken } from "@/mcp/core/confirm";
import { chatJson, toChatValue } from "@/mcp/core/output";
import { isMcpScope, unwrapAction, ToolError } from "@/mcp/core/types";

test("json schema: required, defaults, enums, bounds", () => {
  const s = toJsonSchema(
    z.object({
      id: z.string(),
      limit: z.number().int().min(1).max(200).default(50),
      kind: z.enum(["a", "b"]).optional(),
      tags: z.array(z.string()),
    }),
  );
  assert.deepEqual(s.required, ["id", "tags"]);
  const props = s.properties as Record<string, Record<string, unknown>>;
  assert.equal(props.limit?.type, "integer");
  assert.equal(props.limit?.default, 50);
  assert.equal(props.limit?.maximum, 200);
  assert.deepEqual(props.kind?.enum, ["a", "b"]);
  assert.equal((props.tags?.items as Record<string, unknown>).type, "string");
  assert.equal(s.additionalProperties, false);
});

test("canonical json ignores key order and undefined", () => {
  assert.equal(canonicalJson({ b: 1, a: [1, { d: 2, c: 3 }], x: undefined }), canonicalJson({ a: [1, { c: 3, d: 2 }], b: 1 }));
});

const binding = { tokenId: "tok_a", tool: "run_app_action", workspaceId: "ws_a", args: { action: "x.y", args: [1] } };

test("preview token: valid for the same binding", () => {
  const { token } = issuePreviewToken(binding);
  assert.deepEqual(checkPreviewToken(binding, token), { ok: true });
});

test("preview token: refused without a token, for other args, other workspace, other key, other tool", () => {
  const { token } = issuePreviewToken(binding);
  assert.equal(checkPreviewToken(binding, undefined).ok, false);
  assert.equal(checkPreviewToken({ ...binding, args: { action: "x.y", args: [2] } }, token).ok, false);
  assert.equal(checkPreviewToken({ ...binding, workspaceId: "ws_b" }, token).ok, false);
  assert.equal(checkPreviewToken({ ...binding, tokenId: "tok_b" }, token).ok, false);
  assert.equal(checkPreviewToken({ ...binding, tool: "create_assessment_from_template" }, token).ok, false);
  assert.equal(checkPreviewToken(binding, "garbage").ok, false);
});

test("preview token: expires after 10 minutes", () => {
  const t0 = Date.now();
  const { token } = issuePreviewToken(binding, t0);
  assert.equal(checkPreviewToken(binding, token, t0 + 9 * 60 * 1000).ok, true);
  assert.equal(checkPreviewToken(binding, token, t0 + 11 * 60 * 1000).ok, false);
});

test("output: dates become DD-MM-YYYY HH:MM IST, from Date and from ISO strings", () => {
  const out = toChatValue({ a: new Date("2026-11-14T00:00:00.000Z"), b: "2026-01-31T20:45:00.000Z", c: "2026-11-14" }) as Record<string, string>;
  assert.equal(out.a, "14-11-2026 05:30 IST");
  assert.equal(out.b, "01-02-2026 02:15 IST");
  assert.equal(out.c, "2026-11-14", "a bare date is not a timestamp");
  assert.match(out.a, /^\d{2}-\d{2}-\d{4} \d{2}:\d{2} IST$/);
});

test("output: secrets are redacted, booleans kept, our preview_token kept", () => {
  const text = chatJson({ keySecret: "rzp_secret", apiKey: "sk-123", hasToken: true, nested: { password: "x" }, preview_token: "123.abc" });
  const parsed = JSON.parse(text) as Record<string, unknown>;
  assert.equal(parsed.keySecret, "[redacted]");
  assert.equal(parsed.apiKey, "[redacted]");
  assert.equal(parsed.hasToken, true);
  assert.equal((parsed.nested as Record<string, unknown>).password, "[redacted]");
  assert.equal(parsed.preview_token, "123.abc");
});

test("scopes and action unwrap", () => {
  assert.equal(isMcpScope("mcp_read"), true);
  assert.equal(isMcpScope("meta_match"), false);
  assert.deepEqual(unwrapAction({ ok: true, data: { id: "1" } }), { id: "1" });
  assert.throws(() => unwrapAction({ ok: false, error: "nope" }), (e: unknown) => e instanceof ToolError && e.message === "nope");
});
