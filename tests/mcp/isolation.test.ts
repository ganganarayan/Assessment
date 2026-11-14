import "./env";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

/**
 * WORKSPACE A CANNOT READ WORKSPACE B, end to end through the real MCP endpoint handler and
 * a real database.
 *
 * Runs only with MCP_DB_TEST=1, against the STAGING database (the owner's choice,
 * 14-11-2026: exclusive fixture workspaces on staging, created and removed by the test):
 *
 *   railway run --environment orbitq-assess -- npx tsx --conditions=react-server --test tests/mcp/isolation.test.ts
 *   (with MCP_DB_TEST=1 set)
 *
 * Every row it makes carries the "mcptest" prefix, is unlimited (so plan and release checks
 * pass without touching any switch), and is deleted in after(), and also before() in case a
 * previous run died halfway. It refuses to run against the production database.
 */

const ENABLED = process.env.MCP_DB_TEST === "1";
const PREFIX = "mcptest";
const PROD_HINTS = [/assess360\.divineleads\.guru/, /production/i];

type Prisma = typeof import("@/lib/db/prisma").prisma;
let prisma: Prisma;
let handle: (req: Request) => Promise<Response>;

const ids = {
  a: `${PREFIX}_alpha`,
  b: `${PREFIX}_bravo`,
  agency: `${PREFIX}_agency`,
  client: `${PREFIX}_client`,
};
const keys: Record<"a" | "b" | "agency", string> = { a: "", b: "", agency: "" };
const rows = { assessA: "", assessB: "", assessClient: "", leadA: "", leadB: "", templateB: "" };

async function cleanup() {
  const tenants = Object.values(ids);
  await prisma.submission.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.pageView.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.assessment.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.template.deleteMany({ where: { ownerTenantId: { in: tenants } } });
  await prisma.apiToken.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: `${PREFIX}-` } } });
  // client first: it points at the agency
  await prisma.tenant.deleteMany({ where: { id: ids.client } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
}

async function makeWorkspace(key: "a" | "b" | "agency", tenantId: string) {
  await prisma.tenant.create({ data: { id: tenantId, slug: tenantId.replace(/_/g, "-"), name: `MCP test ${key}`, unlimited: true } });
  const user = await prisma.user.create({ data: { name: `MCP test ${key}`, email: `${PREFIX}-${key}@example.invalid`, tenantId } });
  const { generateApiToken } = await import("@/lib/api-auth/token");
  const t = generateApiToken("mcp_write");
  await prisma.apiToken.create({ data: { tokenHash: t.tokenHash, prefix: t.prefix, scope: "mcp_write", tenantId, createdById: user.id, label: "isolation test" } });
  keys[key] = t.plaintext;
}

async function seed() {
  await makeWorkspace("a", ids.a);
  await makeWorkspace("b", ids.b);
  await makeWorkspace("agency", ids.agency);
  await prisma.tenant.create({ data: { id: ids.client, slug: `${PREFIX}-client`, name: "MCP test client", unlimited: true, agencyAdminTenantId: ids.agency } });

  const mk = async (tenantId: string, tag: string) =>
    (await prisma.assessment.create({ data: { tenantId, slug: `${PREFIX}-${tag}-${Date.now()}`, title: `MCP test funnel ${tag}` } })).id;
  rows.assessA = await mk(ids.a, "a");
  rows.assessB = await mk(ids.b, "b");
  rows.assessClient = await mk(ids.client, "client");

  rows.leadA = (await prisma.submission.create({ data: { tenantId: ids.a, assessmentId: rows.assessA, leadEmail: "lead-a@example.invalid", leadFirstName: "Alpha" } })).id;
  rows.leadB = (await prisma.submission.create({ data: { tenantId: ids.b, assessmentId: rows.assessB, leadEmail: "lead-b@example.invalid", leadFirstName: "Bravo" } })).id;
  await prisma.submission.create({ data: { tenantId: ids.a, assessmentId: rows.assessA, leadEmail: "preview@example.invalid", isPreview: true } });
  await prisma.pageView.createMany({
    data: [
      { tenantId: ids.a, assessmentId: rows.assessA, visitorId: "va1", utmContent: "ad_111" },
      { tenantId: ids.a, assessmentId: rows.assessA, visitorId: "va2", utmContent: "ad_222" },
      { tenantId: ids.b, assessmentId: rows.assessB, visitorId: "vb1", utmContent: "ad_111" },
    ],
  });
  rows.templateB = (
    await prisma.template.create({
      data: { slug: `${PREFIX}-template-b-${Date.now()}`, title: "B private template", category: "Test", body: {}, ownerTenantId: ids.b, published: false },
    })
  ).id;
}

let rpcId = 0;
async function rpc(key: string, method: string, params: unknown = {}) {
  const res = await handle(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    }),
  );
  return { status: res.status, body: (await res.json()) as { result?: { content?: { text: string }[]; isError?: boolean; tools?: { name: string }[] }; error?: { message: string } } };
}

async function call(key: string, name: string, args: Record<string, unknown> = {}) {
  const r = await rpc(key, "tools/call", { name, arguments: args });
  const text = r.body.result?.content?.[0]?.text ?? r.body.error?.message ?? "";
  return { isError: !!r.body.result?.isError || !!r.body.error, text };
}

before(async () => {
  if (!ENABLED) return;
  const url = process.env.DATABASE_URL ?? "";
  if (PROD_HINTS.some((r) => r.test(url)) || process.env.RAILWAY_ENVIRONMENT_NAME === "production") {
    throw new Error("Refusing to run the MCP isolation test against production.");
  }
  ({ prisma } = await import("@/lib/db/prisma"));
  const { handleMcpPost } = await import("@/mcp/core/protocol");
  handle = (req) => handleMcpPost(req, "test");
  await cleanup();
  await seed();
});

after(async () => {
  if (!ENABLED || !prisma) return;
  await cleanup();
  await prisma.$disconnect();
});

const t = (name: string, fn: () => Promise<void>) => test(name, { skip: ENABLED ? false : "set MCP_DB_TEST=1 to run against staging" }, fn);

t("no key, a bad key: refused", async () => {
  const r = await handle(new Request("http://localhost/api/mcp", { method: "POST", body: "{}" }));
  assert.equal(r.status, 401);
  assert.equal((await rpc("mcp_nope_nope", "tools/list")).status, 401);
});

t("initialize and tools/list answer", async () => {
  const init = await rpc(keys.a, "initialize", { protocolVersion: "2025-06-18" });
  assert.equal(init.status, 200);
  const list = await rpc(keys.a, "tools/list");
  const names = list.body.result?.tools?.map((x) => x.name) ?? [];
  for (const n of ["connection_status", "list_assessments", "get_funnel_stats", "list_leads", "get_lead", "list_templates", "create_assessment_from_template", "run_app_action"]) {
    assert.ok(names.includes(n), `tools/list is missing ${n}`);
  }
});

t("A lists only A's assessments", async () => {
  const r = await call(keys.a, "list_assessments");
  assert.equal(r.isError, false, r.text);
  assert.ok(r.text.includes(rows.assessA));
  assert.ok(!r.text.includes(rows.assessB), "A saw B's assessment");
  assert.ok(!r.text.includes(rows.assessClient));
});

t("A cannot open B's assessment, lead, or stats by id", async () => {
  assert.equal((await call(keys.a, "get_assessment", { assessment_id: rows.assessB })).isError, true);
  assert.equal((await call(keys.a, "get_lead", { lead_id: rows.leadB })).isError, true);
  assert.equal((await call(keys.a, "get_funnel_stats", { assessment_id: rows.assessB })).isError, true);
  assert.equal((await call(keys.a, "list_leads", { assessment_id: rows.assessB })).isError, true);
});

t("A's leads hold only A's real lead; the test run is separate", async () => {
  const r = await call(keys.a, "list_leads");
  assert.ok(r.text.includes(rows.leadA));
  assert.ok(!r.text.includes(rows.leadB) && !r.text.includes("Bravo"), "A saw B's lead");
  assert.ok(!r.text.includes("preview@example.invalid"), "test run leaked into real leads");
  const withTests = await call(keys.a, "list_leads", { include_test_runs: true });
  assert.ok(withTests.text.includes("preview@example.invalid"));
});

t("stats: A counts only A's traffic, by ad id too, with test runs apart", async () => {
  const all = JSON.parse((await call(keys.a, "get_funnel_stats")).text) as { visits: { total: number }; opt_ins: { real: number; test_runs: number } };
  assert.equal(all.visits.total, 2, "A's visit count includes another workspace");
  assert.equal(all.opt_ins.real, 1);
  assert.equal(all.opt_ins.test_runs, 1);
  const ad = JSON.parse((await call(keys.a, "get_funnel_stats", { ad_id: "ad_111" })).text) as { visits: { total: number } };
  assert.equal(ad.visits.total, 1, "ad_111 counted B's visit too");
});

t("A cannot target B's workspace with workspace_id", async () => {
  const r = await call(keys.a, "list_assessments", { workspace_id: ids.b });
  assert.equal(r.isError, true);
  assert.match(r.text, /not reachable/);
});

t("A cannot see or import B's private template", async () => {
  const list = await call(keys.a, "list_templates");
  assert.ok(!list.text.includes(rows.templateB));
  assert.equal((await call(keys.a, "get_template", { template_id: rows.templateB })).isError, true);
  assert.equal((await call(keys.a, "create_assessment_from_template", { template_id: rows.templateB })).isError, true);
});

t("the app's own actions run scoped: A's listApiTokens shows only A's key", async () => {
  const r = await call(keys.a, "run_app_action_read", { action: "api-tokens.listApiTokens" });
  assert.equal(r.isError, false, r.text);
  assert.ok(r.text.includes(ids.a));
  assert.ok(!r.text.includes(ids.b), "A's action saw B's key");
});

t("writes preview first and refuse a forged or reused preview", async () => {
  const p = await call(keys.a, "run_app_action", { action: "api-tokens.listApiTokens" });
  assert.match(p.text, /"nothing_changed": true/);
  const token = (JSON.parse(p.text) as { preview_token: string }).preview_token;
  const forged = await call(keys.a, "run_app_action", { action: "api-tokens.listApiTokens", confirm: true, preview_token: `${token}x` });
  assert.equal(forged.isError, true);
  const otherKey = await call(keys.b, "run_app_action", { action: "api-tokens.listApiTokens", confirm: true, preview_token: token });
  assert.equal(otherKey.isError, true, "B reused A's preview");
  const ok = await call(keys.a, "run_app_action", { action: "api-tokens.listApiTokens", confirm: true, preview_token: token });
  assert.equal(ok.isError, false, ok.text);
});

t("agency key reaches its client workspace, never an unrelated one", async () => {
  const ws = await call(keys.agency, "list_workspaces");
  assert.ok(ws.text.includes(ids.client) && ws.text.includes(ids.agency));
  assert.ok(!ws.text.includes(ids.a));
  const client = await call(keys.agency, "list_assessments", { workspace_id: ids.client });
  assert.equal(client.isError, false, client.text);
  assert.ok(client.text.includes(rows.assessClient));
  assert.equal((await call(keys.agency, "list_assessments", { workspace_id: ids.a })).isError, true);
});

t("a workspace key cannot reach an agency's client", async () => {
  assert.equal((await call(keys.a, "list_assessments", { workspace_id: ids.client })).isError, true);
});

t("a revoked key stops at once", async () => {
  const { hashApiToken } = await import("@/lib/api-auth/token");
  await prisma.apiToken.update({ where: { tokenHash: hashApiToken(keys.b) }, data: { revokedAt: new Date() } });
  assert.equal((await rpc(keys.b, "tools/list")).status, 401);
});
