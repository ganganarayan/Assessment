import "./env";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { McpToolListing } from "@/mcp/core/registry";
import type { McpIdentity } from "@/mcp/core/types";
import { createGateway } from "@/mcp/gateway/core";
import { allocate, MAX_TOOLS_SHOWN } from "@/mcp/gateway/budget";
import { DOWN_TTL_MS, ENTITLEMENT_TTL_MS, EntitlementCache } from "@/mcp/gateway/entitlements";
import { parseSse, readEntitlement } from "@/mcp/gateway/http-port";
import { RULES } from "@/mcp/gateway/suggestions";
import type { AssessmentFacts, GatewayCallResult, UpstreamApp, UpstreamPort, UpstreamTool } from "@/mcp/gateway/types";

const ASSESS_ID = "cmvccheca000uqo3t5v1r2zfo";

const app = (prefix: string, name: string): UpstreamApp => ({
  prefix,
  name,
  url: `https://${prefix}.internal/mcp`,
  secret: "s",
  description: `${name} does things.`,
  upgradeUrl: `https://${prefix}.example/upgrade`,
});
const ROUTER = app("router", "AVideoRouter");
const VIDA = app("vidapulse", "VidaPulse");
const CONTENT = app("content", "Content Engine");

const tool = (name: string, read = true): UpstreamTool => ({ name, description: name, inputSchema: { type: "object" }, annotations: { readOnlyHint: read } });

const ident = (email: string, scope: "mcp_read" | "mcp_write" = "mcp_write"): McpIdentity =>
  ({ tokenId: `tok_${email}`, tokenPrefix: "a360_x", tokenLabel: null, scope, homeTenantId: "t1", isOwner: false, isAgency: false, user: { id: `u_${email}`, email } }) as unknown as McpIdentity;

const ownTools: McpToolListing[] = [
  { name: "get_assessment", title: "", description: "", inputSchema: { type: "object" }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: "run_app_action", title: "", description: "", inputSchema: { type: "object" }, annotations: { readOnlyHint: false, destructiveHint: false } },
];

interface World {
  /** prefix -> emails active there */
  active: Record<string, string[]>;
  tools: Record<string, UpstreamTool[]>;
  down?: Set<string>;
  hang?: Set<string>;
  calls: { entitlement: number };
  facts?: AssessmentFacts[];
}

function makePort(w: World): UpstreamPort {
  return {
    async entitlement(a, email) {
      w.calls.entitlement++;
      if (w.down?.has(a.prefix)) throw new Error("connection refused");
      if (w.hang?.has(a.prefix)) await new Promise(() => undefined);
      return (w.active[a.prefix] ?? []).includes(email);
    },
    async listTools(a) {
      return w.tools[a.prefix] ?? [];
    },
    async callTool(_a, _e, name, args): Promise<GatewayCallResult> {
      if (args.fail) return { content: [{ type: "text", text: "failed" }], isError: true };
      return { content: [{ type: "text", text: `ran ${name}` }], structuredContent: { ran: name } };
    },
  };
}

function build(w: World, opts: { now?: () => number; timeoutMs?: number } = {}) {
  const dismissals = new Map<string, Date>();
  const port = makePort(w);
  const gw = createGateway({
    apps: async () => [ROUTER, VIDA, CONTENT],
    cache: new EntitlementCache(port, opts.timeoutMs ?? 200),
    port,
    assess: {
      list: () => ownTools,
      call: async (_i, _n, args) =>
        (args as Record<string, unknown>)?.fail ? { content: [{ type: "text", text: "bad" }], isError: true } : { content: [{ type: "text", text: "ok" }] },
    },
    assessmentFacts: async (ids) => (w.facts ?? []).filter((f) => ids.includes(f.id)),
    dismissed: async (userId, now) => new Set([...dismissals].filter(([k, until]) => k.startsWith(`${userId}|`) && until > now).map(([k]) => k.split("|")[1]!)),
    dismiss: async (userId, a, until) => {
      dismissals.set(`${userId}|${a}`, until);
    },
    allow: () => true,
    now: opts.now,
  });
  return gw;
}

const names = (ts: McpToolListing[]) => ts.map((t) => t.name);

test("a user with one app sees only that app's tools, prefixed, after Assess360's own unchanged", async () => {
  const w: World = {
    active: { router: ["a@x.com"], vidapulse: ["b@x.com"] },
    tools: { router: [tool("get_entitlement"), tool("push_recording", false), tool("list_recordings")], vidapulse: [tool("dropoff_report")] },
    calls: { entitlement: 0 },
  };
  const list = await build(w).listTools(ident("a@x.com"));
  assert.deepEqual(names(list), ["get_assessment", "run_app_action", "list_my_apps", "dismiss_suggestion", "router_push_recording", "router_list_recordings"]);
  assert.deepEqual(list.slice(0, 2), ownTools, "Assess360 tools pass through untouched");
});

test("a read-only key sees only the other app's read tools and cannot call its writes", async () => {
  const w: World = { active: { router: ["a@x.com"] }, tools: { router: [tool("push_recording", false), tool("list_recordings")] }, calls: { entitlement: 0 } };
  const gw = build(w);
  assert.ok(!names(await gw.listTools(ident("a@x.com", "mcp_read"))).includes("router_push_recording"));
  const r = await gw.callTool(ident("a@x.com", "mcp_read"), "router_push_recording", {});
  assert.equal(r.isError, true);
});

test("an app that is down or hangs is hidden and the rest of the list still loads", async () => {
  const w: World = {
    active: { router: ["a@x.com"], vidapulse: ["a@x.com"], content: ["a@x.com"] },
    tools: { router: [tool("list_recordings")], vidapulse: [tool("dropoff_report")], content: [tool("draft_post")] },
    down: new Set(["router"]),
    hang: new Set(["vidapulse"]),
    calls: { entitlement: 0 },
  };
  const gw = build(w, { timeoutMs: 50 });
  const list = names(await gw.listTools(ident("a@x.com")));
  assert.ok(list.includes("content_draft_post"));
  assert.ok(!list.some((n) => n.startsWith("router_") || n.startsWith("vidapulse_")));
  const call = await gw.callTool(ident("a@x.com"), "router_list_recordings", {});
  assert.equal(call.isError, true);
  assert.match(JSON.stringify(call.content), /not reachable/);
});

test("entitlements are cached for 10 minutes, a down app for 1 minute", async () => {
  let t = 1_000_000;
  const w: World = { active: { router: ["a@x.com"] }, tools: { router: [tool("list_recordings")] }, calls: { entitlement: 0 } };
  const gw = build(w, { now: () => t });
  await gw.listTools(ident("a@x.com"));
  const first = w.calls.entitlement;
  assert.equal(first, 3, "one lookup per app");
  t += ENTITLEMENT_TTL_MS - 1000;
  await gw.listTools(ident("a@x.com"));
  assert.equal(w.calls.entitlement, first, "inside 10 minutes nothing is asked again");
  t += 2000;
  await gw.listTools(ident("a@x.com"));
  assert.equal(w.calls.entitlement, first * 2, "after 10 minutes every app is asked again");

  w.down = new Set(["router"]);
  t += ENTITLEMENT_TTL_MS + 1;
  await gw.listTools(ident("a@x.com"));
  const afterDown = w.calls.entitlement;
  w.down = undefined;
  t += DOWN_TTL_MS + 1;
  const list = names(await gw.listTools(ident("a@x.com")));
  assert.ok(w.calls.entitlement > afterDown, "a down app is retried after a minute");
  assert.ok(list.includes("router_list_recordings"), "and its tools come back");
});

test("tool cap: never more than 34 tools, shared between apps in turns", async () => {
  const many = (p: string, n: number) => Array.from({ length: n }, (_, i) => tool(`${p}${i}`));
  const w: World = {
    active: { router: ["a@x.com"], vidapulse: ["a@x.com"], content: ["a@x.com"] },
    tools: { router: many("r", 50), vidapulse: many("v", 3), content: many("c", 50) },
    calls: { entitlement: 0 },
  };
  const list = names(await build(w).listTools(ident("a@x.com")));
  assert.equal(list.length, MAX_TOOLS_SHOWN);
  assert.equal(list.filter((n) => n.startsWith("vidapulse_")).length, 3, "the small app keeps all its tools");
  assert.deepEqual(allocate([[1, 2, 3], [4], [5, 6]], 4), [[1, 2], [4], [5]]);
});

test("related_app: an app the user lacks gets the pitch and a link, one per result, only after success", async () => {
  const w: World = { active: { router: ["a@x.com"] }, tools: { router: [tool("push_recording", false)] }, calls: { entitlement: 0 } };
  const gw = build(w);
  const ok = await gw.callTool(ident("a@x.com"), "router_push_recording", {});
  assert.deepEqual(ok.structuredContent, { ran: "push_recording" }, "the result passes through");
  assert.equal(ok.related_app?.app, "content");
  assert.equal(ok.related_app?.owned, false);
  assert.equal(ok.related_app?.url, CONTENT.upgradeUrl);
  assert.equal(ok.related_app?.why, RULES.router_push_done.pitch);
  assert.equal(ok.content.filter((c) => JSON.stringify(c).includes("related_app")).length, 1);

  const failed = await gw.callTool(ident("a@x.com"), "router_push_recording", { fail: true });
  assert.equal(failed.related_app, undefined, "never on an error");

  const again = await gw.callTool(ident("a@x.com"), "router_push_recording", {});
  assert.equal(again.related_app?.app, "content", "shown again on the next relevant success");
});

test("related_app: an app the user has is offered as work, never as a sign-up", async () => {
  const w: World = { active: { router: ["a@x.com"], content: ["a@x.com"] }, tools: { router: [tool("push_recording", false)], content: [] }, calls: { entitlement: 0 } };
  const r = await build(w).callTool(ident("a@x.com"), "router_push_recording", {});
  assert.equal(r.related_app?.owned, true);
  assert.equal(r.related_app?.url, undefined);
  assert.equal(r.related_app?.why, RULES.router_push_done.offer);
});

test("related_app on Assess360: not on a preview, ad-ready and video after a confirmed write", async () => {
  const w: World = {
    active: {},
    tools: {},
    calls: { entitlement: 0 },
    facts: [{ id: ASSESS_ID, status: "PUBLISHED", fireMetaCapi: true, adAccountId: "ad1", pages: [{ blocks: [{ type: "video" }] }] }],
  };
  const gw = build(w);
  const preview = await gw.callTool(ident("a@x.com"), "run_app_action", { args: [ASSESS_ID] });
  assert.equal(preview.related_app, undefined, "a preview is a half-finished task");
  const done = await gw.callTool(ident("a@x.com"), "run_app_action", { args: [ASSESS_ID], confirm: true, preview_token: "t" });
  assert.equal(done.related_app?.app, "content", "ad-ready comes first");
  const read = await gw.callTool(ident("a@x.com"), "get_assessment", { assessment_id: ASSESS_ID });
  assert.equal(read.related_app?.app, "vidapulse", "a read with a video suggests VidaPulse");
  const err = await gw.callTool(ident("a@x.com"), "get_assessment", { assessment_id: ASSESS_ID, fail: true });
  assert.equal(err.related_app, undefined);
});

test("dismiss_suggestion stops one app for 7 days, then it can come back", async () => {
  let t = 2_000_000_000_000;
  const w: World = { active: { router: ["a@x.com"] }, tools: { router: [tool("push_recording", false)] }, calls: { entitlement: 0 } };
  const gw = build(w, { now: () => t });
  const d = await gw.callTool(ident("a@x.com"), "dismiss_suggestion", { app: "Content Engine" });
  assert.notEqual(d.isError, true);
  assert.match(JSON.stringify(d.content), /\d{2}-\d{2}-\d{4}/, "the date is DD-MM-YYYY");
  assert.equal((await gw.callTool(ident("a@x.com"), "router_push_recording", {})).related_app, undefined);
  assert.equal((await gw.callTool(ident("b@x.com"), "router_push_recording", {})).related_app, undefined, "b lacks router entirely");
  t += 7 * 24 * 60 * 60 * 1000 + 1;
  assert.equal((await gw.callTool(ident("a@x.com"), "router_push_recording", {})).related_app?.app, "content");
});

test("list_my_apps splits have and do-not-have, with links", async () => {
  const w: World = { active: { router: ["a@x.com"] }, tools: { router: [] }, down: new Set(["content"]), calls: { entitlement: 0 } };
  const r = await build(w).callTool(ident("a@x.com"), "list_my_apps", {});
  const body = JSON.parse((r.content[0] as { text: string }).text) as {
    have: { app: string }[];
    do_not_have: { app: string; get_it: string }[];
    not_reachable_right_now: string[];
  };
  assert.deepEqual(body.have.map((h) => h.app), ["Assess360", "AVideoRouter"]);
  assert.deepEqual(body.do_not_have.map((h) => [h.app, h.get_it]), [["VidaPulse", VIDA.upgradeUrl]]);
  assert.deepEqual(body.not_reachable_right_now, ["Content Engine"]);
});

test("wire helpers: SSE replies and entitlement shapes", () => {
  const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":7,"result":{"ok":1}}\n\n';
  assert.deepEqual(parseSse(sse, 7)?.result, { ok: 1 });
  assert.equal(readEntitlement({ structuredContent: { active: true } }), true);
  assert.equal(readEntitlement({ content: [{ type: "text", text: '{"status":"active"}' }] }), true);
  assert.equal(readEntitlement({ content: [{ type: "text", text: '{"active":false}' }] }), false);
  assert.equal(readEntitlement({ isError: true, structuredContent: { active: true } }), false);
});
