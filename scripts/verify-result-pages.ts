/**
 * Result-page library verification (no DB).
 *
 * Three rules hold this feature up, and each one fails SILENTLY if it drifts:
 *
 *  1. The binding is 1:1, enforced by a UNIQUE column - not by an action. If the
 *     unique is ever dropped, two funnels can share a page and an edit to one starts
 *     rewording the other's live result, with nothing to notice it on.
 *  2. Publishing a doc MIRRORS onto the bound assessment. The public reads the
 *     assessment's own columns; if the mirror goes missing, Publish succeeds, the
 *     library shows "Published", and the respondent sees the old page forever.
 *  3. The public read path still reads those columns, not the doc. The moment a public
 *     renderer follows the link instead, unbinding or deleting a library row becomes a
 *     way to break a live funnel.
 *
 *   npx tsx scripts/verify-result-pages.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { slugifyDocTitle, copyTitle, isDocKind, KIND_LABEL } from "../src/features/result-pages/docs";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

console.log("Result-page library verification\n");

/* ---- 1. The 1:1 binding lives in the schema, not in an if-statement ---- */
const schema = read("prisma/schema.prisma");
expect(
  "the results-page link is UNIQUE on the assessment",
  /resultsDocId\s+String\?\s+@unique/.test(schema),
  "without the unique, two funnels can bind the same page and edits cross between them",
);
expect(
  "the VSL-page link is UNIQUE on the assessment",
  /vslDocId\s+String\?\s+@unique/.test(schema),
  "without the unique, two funnels can bind the same page and edits cross between them",
);
expect(
  "deleting an assessment frees its pages rather than destroying them",
  /resultsDoc\s+ResultPageDoc\?\s+@relation\("AssessmentResultsDoc"[^)]*onDelete: SetNull/.test(schema),
);
/** One model's body, so a check cannot accidentally match the rest of the schema. */
const modelBlock = (name: string): string => {
  const start = schema.indexOf(`model ${name} {`);
  if (start < 0) return "";
  const end = schema.indexOf("\n}", start);
  return end < 0 ? "" : schema.slice(start, end);
};
const pageModel = modelBlock("AssessmentPage");
expect(
  "a draft page row belongs to a doc, never to an assessment",
  /docId\s+String/.test(pageModel) && !/assessmentId/.test(pageModel),
  "a row still parented by the assessment cannot be cloned or moved between funnels",
);
expect(
  "the library slug is unique per workspace",
  /@@unique\(\[tenantId, slug\]\)/.test(schema),
);

/* ---- The migration has to close the NULL-tenant hole the composite leaves ---- */
const migration = read("prisma/migrations/20261013233000_result_page_docs/migration.sql");
expect(
  "the platform's own slugs are constrained by a partial index",
  /CREATE UNIQUE INDEX "result_page_doc_platform_slug_key"[\s\S]*?WHERE "tenantId" IS NULL/.test(migration),
  "NULLs never collide in a Postgres unique index, so the composite alone constrains nothing there",
);
// Statement by statement, so "publishedPages" appearing in a SELECT that READS the
// live column cannot be mistaken for a write to it.
const liveColumns = ["publishedPages", "pagesPublishedAt", "resultPagePublished", "resultPagePublishedAt"];
const writesALiveColumn = migration
  .split(";")
  .filter((stmt) => /\bUPDATE\s+"assessment"/i.test(stmt))
  .some((stmt) => {
    const set = stmt.slice(stmt.search(/\bSET\b/i));
    return liveColumns.some((c) => set.includes(`"${c}"`));
  });
expect(
  "the backfill never writes to the live columns",
  !writesALiveColumn,
  "a backfill that touches the live snapshot can take a running funnel's page down",
);

/* ---- 2. Publish mirrors onto the bound assessment ---- */
const mirror = read("src/features/result-pages/mirror.ts");
expect(
  "the mirror writes the results snapshot onto the assessment",
  /publishedPages:/.test(mirror) && /pagesPublishedAt:/.test(mirror),
);
expect(
  "the mirror writes the VSL snapshot onto the assessment",
  /resultPagePublished:/.test(mirror) && /resultPagePublishedAt:/.test(mirror),
);
expect(
  "the funnel's cached copy is invalidated when the results snapshot changes",
  /invalidatePublicAssessmentById/.test(mirror),
  "the public funnel renders a cached assessment, so a new snapshot is invisible without this",
);

const vslActions = read("src/features/assessment/actions/result-page.ts");
const pageActions = read("src/features/assessment/actions/pages.ts");
expect("publishing a VSL page mirrors", /publishResultPage[\s\S]*?mirrorPublished\(docId\)/.test(vslActions));
expect("unpublishing a VSL page mirrors", /unpublishResultPage[\s\S]*?mirrorPublished\(docId\)/.test(vslActions));
expect("publishing a results page mirrors", /publishPages[\s\S]*?mirrorPublished\(docId\)/.test(pageActions));
expect("unpublishing a results page mirrors", /unpublishPages[\s\S]*?mirrorPublished\(docId\)/.test(pageActions));
expect(
  "every page mutation is scope-checked",
  (pageActions.match(/docInScope\(/g) ?? []).length >= 10,
  "a missed check here is a cross-tenant write to somebody else's page",
);

/* ---- 3. The public still reads the assessment's own columns ---- */
const publicResult = read("src/app/a/[slug]/r/[submissionId]/page.tsx");
expect(
  "the token result page reads the assessment's published snapshot",
  /submission\.assessment\.resultPagePublished/.test(publicResult),
  "following the doc link instead would let an unbind break a live funnel",
);
const ctaRoute = read("src/app/api/cta/[submissionId]/[blockId]/route.ts");
expect(
  "the booking-CTA resolver reads the assessment's published snapshot",
  /resultPagePublished/.test(ctaRoute),
);
const publicFunnel = read("src/app/a/[slug]/page.tsx");
expect(
  "the funnel reads the assessment's published pages",
  /readPublishedPages\(a\.publishedPages\)/.test(publicFunnel),
);

/* ---- Unbinding must take the live page down with it ---- */
const docActions = read("src/features/result-pages/actions/docs.ts");
expect(
  "unbinding clears the funnel's live snapshot",
  /unbindDoc[\s\S]*?clearMirror\(assessmentId, kind\)/.test(docActions),
  "otherwise the funnel keeps serving a page that is editable from nowhere",
);
expect(
  "a bound page cannot be deleted from the library",
  /deleteDoc[\s\S]*?is in use by/.test(docActions),
);
expect(
  "binding refuses a page that is already on another funnel",
  /is already used by[\s\S]*?Clone it/.test(docActions),
);
expect(
  "the picker offers free pages only",
  /resultsOf: \{ is: null \}, vslOf: \{ is: null \}/.test(read("src/features/result-pages/data.ts")),
  "offering a used page and then refusing it is a worse list than a shorter one",
);

/* ---- An imported funnel must arrive with EDITABLE pages ---- */
const importer = read("src/features/assessment/transfer/import.ts");
expect(
  "an import creates docs from the body's page content",
  /createResultDocsForImport/.test(importer) && /kind: "RESULTS"/.test(importer) && /kind: "VSL"/.test(importer),
);
expect(
  "a duplicated funnel clones its pages instead of sharing them",
  /cloneDoc\(doc\.id\)[\s\S]*?bindDoc\(created\.id, kind/.test(read("src/features/assessment/actions/assessment.ts")),
);

/* ---- The platform shelf: who may list, and what a tenant may read ---- */

/**
 * One exported function's body, so a check reads that function and not the file.
 * Plain string slicing rather than a regex: these assertions are about which guard
 * sits inside which action, and a regex spanning the whole file can satisfy itself
 * from a different function entirely.
 */
const fnBody = (src: string, name: string): string => {
  const start = src.indexOf(`export async function ${name}(`);
  if (start < 0) return "";
  const next = src.indexOf("\nexport ", start + 1);
  return next < 0 ? src.slice(start) : src.slice(start, next);
};

const setShelf = fnBody(docActions, "setDocShelf");
expect(
  "only the platform owner can list a page on the shelf",
  setShelf.includes("if (!scope.isSuper) return"),
  "listing puts content on the first screen of every workspace on the install",
);
expect(
  "only a platform-owned page can be listed",
  setShelf.includes("isPlatformOwned(doc.tenantId)"),
  "otherwise a tenant's own headline and video could be published to the whole install",
);
expect(
  "a page serving a funnel cannot be listed",
  setShelf.includes("listed && bound"),
  "a template is a starting point; copies of a live page would multiply its booking inbox",
);
expect(
  "editing the shelf text is owner-only and platform-only too",
  fnBody(docActions, "setDocShelfMeta").includes("if (!scope.isSuper) return") &&
    fnBody(docActions, "setDocShelfMeta").includes("isPlatformOwned(doc.tenantId)"),
);

const dataSrc = read("src/features/result-pages/data.ts");
expect(
  "the shelf read is narrowed to the platform's own rows",
  dataSrc.includes("const platformWhere = { OR: [{ tenantId: PLATFORM_TENANT_ID }, { tenantId: null }] }"),
  "this is the one cross-workspace read in the feature, so its filter is the boundary",
);
expect(
  "an unlisted page is invisible unless the owner asks for it",
  dataSrc.includes("...(opts.includeUnlisted ? {} : { shelfListed: true })"),
);
// Every query that offers a page for reuse must exclude a page already in use: the
// builder's picker, the shelf listing, and the shelf import.
const excludesBound = (body: string) =>
  body.includes("resultsOf: { is: null }") && body.includes("vslOf: { is: null }");
expect(
  "a bound page never appears on the shelf or in the picker, whatever its flag says",
  excludesBound(fnBody(dataSrc, "listFreeDocs")) &&
    excludesBound(fnBody(dataSrc, "listShelfDocs")) &&
    excludesBound(fnBody(dataSrc, "shelfDocForImport")),
);

const importShelf = fnBody(docActions, "importShelfDoc");
expect(
  "importing from the shelf COPIES into the acting workspace",
  importShelf.includes("configTenantOf(scope)") && importShelf.includes("prisma.resultPageDoc.create"),
  "binding a tenant's funnel to a platform row would let the owner's edit rewrite their live page",
);
expect(
  "an import never binds anything",
  !importShelf.includes("resultsDocId") && !importShelf.includes("vslDocId"),
);
expect(
  "an import does not carry the shelf's own listing or copy",
  !importShelf.includes("shelfListed") && !importShelf.includes("shelfCategory"),
  "the shelf text describes the listing, not the page",
);
expect(
  "the owner may import an unlisted page, to review it",
  importShelf.includes("shelfDocForImport(id, scope.isSuper)"),
);

/* ---- Plain helpers ---- */
expect("a title becomes a usable slug", slugifyDocTitle("Clinic VSL - October 2026!") === "clinic-vsl-october-2026");
expect("an empty title still yields a slug", slugifyDocTitle("   ") === "result-page");
expect("a clone chain does not stack (Copy) suffixes", copyTitle("Clinic VSL (Copy)") === "Clinic VSL (Copy)");
expect("an unknown kind is rejected", !isDocKind("BANNER") && isDocKind("VSL"));
expect("both kinds are named on screen", !!KIND_LABEL.RESULTS && !!KIND_LABEL.VSL);

console.log(failures === 0 ? "\nAll result-page checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
