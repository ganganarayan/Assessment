import "./env";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * Source scans that keep the isolation rules true as tools are added.
 */
const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

/** Each `prisma.model.op( ... )` call with its full argument text (balanced parens). */
function prismaCalls(src: string): { model: string; text: string }[] {
  const out: { model: string; text: string }[] = [];
  const re = /prisma\.(\w+)\.(\w+)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < src.length && depth > 0) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
      i++;
    }
    out.push({ model: m[1]!, text: src.slice(re.lastIndex, i) });
  }
  return out;
}

test("no MCP file reads across all tenants", () => {
  for (const f of walk("src/mcp")) {
    if (f.endsWith("catalog.generated.ts")) continue;
    assert.doesNotMatch(read(f), /ALL_TENANTS/, `${f} must never use ALL_TENANTS`);
  }
});

test("every tenant-owned query in the tools is workspace-scoped", () => {
  // Models that are not tenant-owned rows, or are deliberately cross-workspace:
  // tenant (list_workspaces, reach-checked), template (visibility rule in its where),
  // apiToken (audit/usage only).
  const exempt = new Set(["tenant", "template", "apiToken", "auditLog"]);
  for (const f of walk("src/mcp/tools")) {
    for (const call of prismaCalls(read(f))) {
      if (exempt.has(call.model)) continue;
      assert.match(
        call.text,
        /tenantWhere\(ctx\)|\.\.\.scope\b|\.\.\.base\b/,
        `${f}: prisma.${call.model} call is not scoped to the workspace: ${call.text.slice(0, 120)}`,
      );
    }
  }
});

test("data functions that default to every tenant are always given the workspace scope", () => {
  for (const f of walk("src/mcp/tools")) {
    const src = read(f);
    for (const fn of ["getAnalyticsStats", "getUtmBreakdown", "listSubmissions", "listGateQualified", "listAssessments"]) {
      for (const c of src.split(`${fn}(`).slice(1)) {
        assert.match(c.slice(0, 200), /ctx\.workspace\.scope/, `${f}: ${fn} must be called with ctx.workspace.scope`);
      }
    }
  }
});

test("only the MCP registry may run code as the MCP actor", () => {
  const users = walk("src")
    .filter((f) => read(f).includes("runAsMcpActor("))
    .filter((f) => !f.endsWith("lib/auth/mcp-actor.ts"));
  assert.deepEqual(users, ["src/mcp/core/registry.ts"]);
});

test("the action catalog is fresh", { timeout: 300_000 }, () => {
  execFileSync(process.execPath, [path.join(ROOT, "node_modules/tsx/dist/cli.mjs"), "scripts/gen-mcp-actions.ts", "--check"], {
    cwd: ROOT,
    stdio: "pipe",
  });
});

test("the catalog never offers an excluded or file-taking action", () => {
  const src = read("src/mcp/actions/catalog.generated.ts");
  const catalog = src.split("ACTION_CATALOG: readonly CatalogEntry[] = ")[1]!.split(";\n\nexport const EXCLUDED_ACTIONS")[0]!;
  for (const bad of ["mintApiToken", "enterTenant", "copyStoredSecret", "completeSubmission", "startSubscriptionCheckout", "createVaultUploadTicket"]) {
    assert.doesNotMatch(catalog, new RegExp(`"fn": "${bad}"`), `${bad} must not be in the catalog`);
  }
});
