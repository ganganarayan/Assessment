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
  "connected-apps": "holds other apps' service secrets; set on the super admin Connected apps screen",
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

/**
 * Descriptions for actions whose source has no doc comment, so Claude is never left
 * guessing on the ad-ready path (connect, template, gate, landing, questions, bands,
 * result page, pixel, publish). A source doc comment always wins; an id here that no
 * longer exists fails the generator, so this list cannot rot silently.
 */
const ACTION_DOCS: Record<string, string> = {
  "assessment.assessment.setAssessmentStatus":
    "Publish (publish=true) or unpublish (false) an assessment. Publishing is refused while the workspace is paused, and while no pixel id plus CAPI token is saved unless the funnel says it does not use Meta. Publishing returns ad_link: the public URL and the exact text for the Meta ad's URL parameters field.",
  "assessment.assessment.updateAssessment":
    "Replace the WHOLE funnel configuration (every field in input; a field left out falls back to its default). Read the funnel with get_assessment first and send every field back. For landing copy only, use assessment.landing.saveLandingScreen instead.",
  "assessment.assessment.deleteAssessment": "Delete an assessment with its categories, questions, bands and submissions. Cannot be undone.",
  "assessment.category.createCategory": "Add a scored category (section) to an assessment. page groups categories onto screens when questions show per category.",
  "assessment.category.updateCategory": "Rename a category or change its page and description.",
  "assessment.category.deleteCategory": "Delete a category and every question in it.",
  "assessment.category-band.createCategoryBand":
    "Add a score band to one category (LOW, MEDIUM, HIGH or CRITICAL) covering minScore to maxScore on that category's 0 to 100 score, with an optional suggestion shown on the result.",
  "assessment.category-band.updateCategoryBand": "Change one category band's level, range or suggestion.",
  "assessment.category-band.deleteCategoryBand": "Delete one category band.",
  "assessment.question.createQuestion":
    "Add a question to a category. SINGLE_SELECT takes options, each with value (the points that answer scores) and label. weight multiplies the question inside its category. FREE_TEXT takes no options and scores nothing.",
  "assessment.question.updateQuestion": "Replace a question's text, type, weight and full option list (send every option, with its points).",
  "assessment.question.deleteQuestion": "Delete one question and its options.",
  "assessment.question.reorderQuestions": "Set the order of the questions in a category: ids in the new order.",
  "assessment.result-band.createResultBand":
    "Add an overall result band: title, level (LOW, MEDIUM, HIGH, CRITICAL), minScore to maxScore on the 0 to 100 total, and the description the respondent reads. Bands should cover 0 to 100 with no gap or overlap.",
  "assessment.result-band.updateResultBand": "Change one overall result band's title, level, range or description.",
  "assessment.result-band.deleteResultBand": "Delete one overall result band.",
  "assessment.pages.addPage": "Add an empty page to a result page document (docId from result-pages.docs). Returns every page.",
  "assessment.pages.deletePage": "Delete one page of a result page document with its blocks.",
  "assessment.pages.listPages": "Read every page and block of a result page document.",
  "assessment.pages.getResultForPages": "Read the scored result a result page would show for one submission.",
  "assessment.pages.addBlock":
    "Add a block to a result page. type is one of: text, video, pay_button, overall_band, band_sentence, category_scores. Set its content with updateBlockConfig.",
  "assessment.pages.deleteBlock": "Delete one block from a result page.",
  "assessment.pages.moveBlock": "Move a block up or down on its page.",
  "assessment.pages.updateBlockConfig":
    "Replace one block's settings (its text, video url, button label and link, and so on). Read the block with listPages first to see its current config.",
  "assessment.pages.updatePageTitle": "Rename one page of a result page document.",
  "events.capi-test.getPurchaseSettingsForm": "Read the workspace's Purchase event settings (event name and which payments report to Meta).",
  "events.capi-test.savePurchaseSettings": "Save the workspace's Purchase event settings.",
  "events.settings.updateAbandonedHours": "Set how many hours after starting an unfinished assessment counts as abandoned.",
  "events.webhooks.createWebhook": "Add a webhook: eventType (which event), a name, the receiving url, and whether it starts active.",
  "events.webhooks.activateWebhook": "Turn a webhook on.",
  "events.webhooks.deactivateWebhook": "Turn a webhook off without deleting it.",
  "events.webhooks.purgeWebhook": "Delete a webhook and its delivery history.",
};

const READ_PREFIX = /^(get|list|load|read|preview|count|has|search|lookup|find)[A-Z]/;
const READ_NAMES = new Set(["aiRerunCount", "agencyTenantExtraPrice", "lifecycleSummary", "fetchWabaTemplates", "vaultMultipartThreshold", "adReadiness"]);
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
  const head = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").trimStart();
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

interface Field {
  name: string;
  type: string;
  optional: boolean;
  doc?: string;
}
interface Param {
  name: string;
  type: string;
  optional: boolean;
  /** One entry per property when the parameter is an object, so a long input type
   *  (createAssessment, updateAssessment) stays fully readable past MAX_TYPE. */
  fields?: Field[];
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

const MAX_FIELD_TYPE = 600;
const fieldsOf = (t: ts.Type, at: ts.Node): Field[] | undefined => {
  const base = checker.getNonNullableType(t);
  if (!(base.flags & ts.TypeFlags.Object) || checker.isArrayType(base) || base.getCallSignatures().length) return undefined;
  const props = checker.getPropertiesOfType(base);
  if (props.length === 0) return undefined;
  return props.slice(0, 120).map((prop) => {
    const s = checker
      .typeToString(checker.getTypeOfSymbolAtLocation(prop, at), at, ts.TypeFormatFlags.NoTruncation)
      .replace(/import\("[^"]+"\)\./g, "");
    const doc = ts.displayPartsToString(prop.getDocumentationComment(checker)).replace(/\s+/g, " ").trim();
    return {
      name: prop.getName(),
      type: s.length > MAX_FIELD_TYPE ? `${s.slice(0, MAX_FIELD_TYPE)}...` : s,
      optional: !!(prop.flags & ts.SymbolFlags.Optional),
      ...(doc ? { doc: doc.length > 300 ? `${doc.slice(0, 300)}...` : doc } : {}),
    };
  });
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
    const params: Param[] = node.parameters.map((p) => {
      const t = checker.getTypeAtLocation(p);
      const fields = fieldsOf(t, p);
      return {
        name: p.name.getText(sf),
        type: typeText(t, p),
        optional: !!p.questionToken || !!p.initializer,
        ...(fields ? { fields } : {}),
      };
    });
    const takesFile = params.some((p) => /\b(FormData|File|Blob)\b/.test(p.type));
    if (reason || takesFile) {
      excluded.push({ id, reason: reason ?? "takes a file or FormData" });
      return;
    }
    const sym = checker.getSymbolAtLocation(node.name);
    const doc =
      (sym ? ts.displayPartsToString(sym.getDocumentationComment(checker)).replace(/\s+/g, " ").trim() : "") || ACTION_DOCS[id] || "";
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

const staleDocs = Object.keys(ACTION_DOCS).filter((id) => !entries.some((e) => e.id === id));
if (staleDocs.length) {
  console.error(`ACTION_DOCS names actions that no longer exist: ${staleDocs.join(", ")}`);
  process.exit(1);
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
  // Line endings normalised: git checks this file out with CRLF on Windows (autocrlf).
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : "";
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
