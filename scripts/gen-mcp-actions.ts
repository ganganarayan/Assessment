/**
 * Generates src/mcp/actions/catalog.generated.ts: every server action the MCP action bridge
 * may run, with its parameter types read by the TypeScript checker, its doc comment, and
 * whether it reads or writes.
 *
 *   npm run mcp:actions            regenerate
 *   npm run mcp:actions -- --check exit 1 if the committed file is stale (used by the tests)
 *
 * WHY GENERATED. The app has about four hundred server actions and they change weekly. A
 * hand-kept list would drift; this one is rebuilt from the source, and the test suite fails
 * when a new action lands without the catalog being regenerated.
 *
 * WHAT IS LEFT OUT, and why (EXCLUDED below): respondent-side funnel actions (they belong to
 * a visitor, not an operator), checkout and payment verification (a person pays in a
 * browser), the impersonation cookie (MCP picks a workspace per call instead), anything that
 * hands a stored secret back, minting API keys (a key must not mint keys), file uploads
 * (bytes do not travel through chat), and any action taking FormData or a File.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "src/mcp/actions/catalog.generated.ts");

const EXCLUDED_MODULES: Record<string, string> = {
  "assessment.submission": "respondent funnel action",
  "assessment.track": "respondent funnel tracking",
  "assessment.lead-split": "respondent split lead capture",
  "assessment.watch": "respondent video progress",
  "assessment.gate-route": "respondent gate evaluation",
  "calendar.booking": "respondent booking page",
  "calendar.manage": "respondent manage-booking page",
  "contacts.actions-public": "respondent unsubscribe",
  "billing.landing-track": "public marketing tracking",
  "billing.platform-track": "public marketing tracking",
  "marketing.dfy": "public marketing form",
  "platform.lifecycle-optout": "recipient opt-out link",
  "payments.pay-order": "respondent payment page",
  "auth.session": "browser session",
  "auth.password": "password change belongs to the person, in the browser",
  "platform.self-provision": "signup flow",
  "billing.subscribe": "checkout is paid in a browser",
  "billing.test-charge": "checkout is paid in a browser",
  "payments.test-payment": "checkout is paid in a browser",
  "secrets": "returns stored secrets",
};

const EXCLUDED_ACTIONS: Record<string, string> = {
  "platform.enterTenant": "MCP picks a workspace per call (workspace_id)",
  "platform.exitTenant": "MCP picks a workspace per call (workspace_id)",
  "agency.enterAgencyTenant": "MCP picks a workspace per call (workspace_id)",
  "agency.exitAgencyTenant": "MCP picks a workspace per call (workspace_id)",
  "api-tokens.mintApiToken": "a key must not mint keys",
  "billing.slots.addAgencyTenantSlot": "starts a checkout paid in a browser",
  "billing.slots.verifySlotPayment": "payment verification",
  "vault.createVaultUploadTicket": "file upload",
  "vault.confirmVaultUpload": "file upload",
  "vault.discardVaultUpload": "file upload",
  "vault.startVaultMultipart": "file upload",
  "vault.signVaultParts": "file upload",
  "vault.completeVaultMultipart": "file upload",
  "vault.abortVaultMultipart": "file upload",
};

const READ_PREFIX = /^(get|list|load|read|preview|count|has|search|lookup|find)[A-Z]/;
const READ_NAMES = new Set(["aiRerunCount", "agencyTenantExtraPrice", "lifecycleSummary", "fetchWabaTemplates", "vaultMultipartThreshold"]);
const DESTRUCTIVE =
  /^(delete|purge|remove|revoke|cancel|disconnect|clear|stop|reject|rollback|unpublish|unbind|discard|abort|deactivate|send|resend|regenerate|retry|fire|submit|setUserSuperAdmin|setTenantSuspended|setUserPassword|setWorkspaceUserPassword|setTenantUnlimited|setFeatureRelease|startScore|startCustom|scheduleBroadcast|setLifecycleLive|reseed|revert|importAssessments|importTenantAssessments)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function isUseServer(file: string): boolean {
  const head = fs.readFileSync(file, "utf8").replace(/^﻿/, "").trimStart();
  return head.startsWith('"use server"') || head.startsWith("'use server'");
}

/** src/features/assessment/actions/question.ts -> assessment.question */
function areaOf(rel: string): string {
  const parts = rel
    .replace(/\\/g, "/")
    .replace(/^src\/(features|lib)\//, "")
    .replace(/\.tsx?$/, "")
    .split("/")
    .filter((p) => p !== "actions");
  return parts.length ? parts.join(".") : "actions";
}

const files = [...walk(path.join(ROOT, "src/features")), ...walk(path.join(ROOT, "src/lib"))].filter(isUseServer).sort();

const configPath = path.join(ROOT, "tsconfig.json");
const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, ROOT);
const program = ts.createProgram(files, { ...parsed.options, noEmit: true, incremental: false });
const checker = program.getTypeChecker();

interface Param {
  name: string;
  type: string;
  optional: boolean;
}
interface Entry {
  id: string;
  module: string;
  fn: string;
  file: string;
  kind: "read" | "write";
  destructive: boolean;
  params: Param[];
  returns: string;
  doc: string;
}

const MAX_TYPE = 1200;
const typeText = (t: ts.Type, at: ts.Node) => {
  const s = checker.typeToString(t, at, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType);
  const clean = s.replace(/import\("[^"]+"\)\./g, "");
  return clean.length > MAX_TYPE ? `${clean.slice(0, MAX_TYPE)}...` : clean;
};

const entries: Entry[] = [];
const excluded: { id: string; reason: string }[] = [];
const modules = new Map<string, string>();

for (const abs of files) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
  const area = areaOf(rel);
  const sf = program.getSourceFile(abs);
  if (!sf) continue;
  const importPath = `@/${rel.replace(/^src\//, "").replace(/\.tsx?$/, "")}`;

  sf.forEachChild((node) => {
    if (!ts.isFunctionDeclaration(node) || !node.name) return;
    const mods = ts.getModifiers(node) ?? [];
    if (!mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) || !mods.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) return;
    const fn = node.name.text;
    const id = `${area}.${fn}`;

    const moduleReason = Object.entries(EXCLUDED_MODULES).find(([m]) => area === m || area.startsWith(`${m}.`))?.[1];
    const reason = moduleReason ?? EXCLUDED_ACTIONS[id];
    const sig = checker.getSignatureFromDeclaration(node);
    const params: Param[] = node.parameters.map((p) => ({
      name: p.name.getText(sf),
      type: typeText(checker.getTypeAtLocation(p), p),
      optional: !!p.questionToken || !!p.initializer,
    }));
    const takesFile = params.some((p) => /\b(FormData|File|Blob)\b/.test(p.type));
    if (reason || takesFile) {
      excluded.push({ id, reason: reason ?? "takes a file or FormData" });
      return;
    }
    const sym = checker.getSymbolAtLocation(node.name);
    const doc = sym ? ts.displayPartsToString(sym.getDocumentationComment(checker)).replace(/\s+/g, " ").trim() : "";
    const kind = READ_PREFIX.test(fn) || READ_NAMES.has(fn) ? "read" : "write";
    modules.set(rel, importPath);
    entries.push({
      id,
      module: importPath,
      fn,
      file: rel,
      kind,
      destructive: kind === "write" && DESTRUCTIVE.test(fn),
      params,
      returns: sig ? typeText(checker.getReturnTypeOfSignature(sig), node) : "unknown",
      doc: doc.length > 500 ? `${doc.slice(0, 500)}...` : doc,
    });
  });
}

entries.sort((a, b) => a.id.localeCompare(b.id));
excluded.sort((a, b) => a.id.localeCompare(b.id));

const loaders = [...new Set(entries.map((e) => e.module))]
  .sort()
  .map((m) => `  ${JSON.stringify(m)}: () => import(${JSON.stringify(m)}) as Promise<Record<string, unknown>>,`)
  .join("\n");

const body = `// GENERATED by scripts/gen-mcp-actions.ts. Do not edit by hand: run npm run mcp:actions.
import "server-only";
import type { CatalogEntry } from "@/mcp/actions/types";

export const ACTION_CATALOG: readonly CatalogEntry[] = ${JSON.stringify(entries, null, 2)};

export const EXCLUDED_ACTIONS: readonly { id: string; reason: string }[] = ${JSON.stringify(excluded, null, 2)};

export const ACTION_LOADERS: Record<string, () => Promise<Record<string, unknown>>> = {
${loaders}
};
`;

if (process.argv.includes("--check")) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (current !== body) {
    console.error("src/mcp/actions/catalog.generated.ts is stale. Run: npm run mcp:actions");
    process.exit(1);
  }
  console.log(`catalog fresh: ${entries.length} actions, ${excluded.length} excluded`);
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, body);
  console.log(`wrote ${entries.length} actions (${entries.filter((e) => e.kind === "write").length} write), ${excluded.length} excluded`);
}
