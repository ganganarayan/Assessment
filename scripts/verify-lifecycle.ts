/**
 * Tenant lifecycle, Phase 2 of the multi-tenant review (10-11-2026): verification.
 *
 * Pure, no database, so it runs in the build. Three kinds of check:
 *
 *  1. The pure rules are EXERCISED: reserved workspace names and throwaway inboxes.
 *  2. The PURGE is checked against the SCHEMA, not against a list typed here: every
 *     model that points at a tenant with ON DELETE SET NULL, and every model that carries
 *     a bare tenant id with no foreign key, must be deleted by name in lib/tenant/purge.ts
 *     or be on the short, explained keep-list. A table added next month that forgets this
 *     fails the build instead of quietly handing a deleted business to the platform.
 *  3. The rest is PINNED by a source scan, because each fix is a line a later edit could
 *     undo with no visible symptom: the wrong tenant keeps sending, a cap is beaten by a
 *     double click, a parked workspace keeps saving.
 *
 *   npx tsx --conditions=react-server scripts/verify-lifecycle.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isReservedTenantSlug, isDisposableEmail } from "../src/lib/tenant/signup-rules";

let failures = 0;
const expect = (n: string, cond: boolean, d = "") => {
  if (cond) console.log(`  PASS  ${n}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${n}${d ? `\n        ${d}` : ""}`);
  }
};
const src = (p: string) => readFileSync(join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

console.log("=== Signup rules (lib/tenant/signup-rules) ===");
{
  for (const s of ["admin", "api", "mail", "www", "billing", "Platform"]) expect(`"${s}" is reserved`, isReservedTenantSlug(s));
  for (const s of ["acme", "admin-clinic", "mailroom-co"]) expect(`"${s}" is a normal workspace name`, !isReservedTenantSlug(s));
  expect("a mailinator address is refused", isDisposableEmail("x@mailinator.com"));
  expect("a subdomain of a listed service is refused", isDisposableEmail("x@inbox.mailinator.com"));
  expect("case does not matter", isDisposableEmail("X@YopMail.com"));
  expect("gmail is NOT refused", !isDisposableEmail("someone@gmail.com"));
  expect("a business domain is NOT refused", !isDisposableEmail("ceo@acme.co.in"));
  expect("a lookalike is NOT refused (notmailinator.com)", !isDisposableEmail("x@notmailinator.com"));
  const auth = src("src/lib/auth/auth.ts");
  expect("signup refuses throwaway inboxes in a Better Auth before-hook", auth.includes('ctx.path !== "/sign-up/email"') && auth.includes("isDisposableEmail(email)"));
  expect("signup is throttled per IP", /"\/sign-up\/email": \{ window: 3600, max: \d+ \}/.test(auth));
  expect("signup suffixes a reserved derived slug", auth.includes("isReservedTenantSlug(s)"));
  expect("signup links the workspace to its login in one transaction", /\$transaction\(async \(tx\) => \{\s*const tenant = await tx\.tenant\.create/.test(auth));
  const prov = src("src/lib/tenant/provision.ts");
  expect("provisioning refuses a reserved slug", prov.includes("isReservedTenantSlug(s.data)"));
  expect("provisioning is one transaction", prov.includes("await prisma.$transaction(async (tx) =>") && prov.includes("tx.account.create"));
  expect("a typed-in admin password must be changed at first sign-in", prov.includes("mustChangePassword: true"));
  expect("a typed-in staff password must be changed at first sign-in", src("src/features/admin/actions/staff.ts").includes("mustChangePassword: true"));
}

console.log("\n=== Permanent delete covers the schema (lib/tenant/purge) ===");
{
  const schema = src("prisma/schema.prisma");
  const purge = src("src/lib/tenant/purge.ts");
  const setNull = new Set<string>();
  const bare = new Set<string>();
  let model = "";
  let hasTid = false;
  let hasRel = false;
  for (const line of schema.split("\n")) {
    const m = /^model (\w+) \{/.exec(line);
    if (m) {
      model = m[1] ?? "";
      hasTid = false;
      hasRel = false;
      continue;
    }
    if (!model) continue;
    if (/^\s+tenantId\s/.test(line)) hasTid = true;
    if (/fields: \[tenantId\], references/.test(line)) hasRel = true;
    if (/\bTenant\??\s+@relation\(/.test(line) && /onDelete: SetNull/.test(line)) setNull.add(model);
    if (line.startsWith("}")) {
      if (hasTid && !hasRel && model !== "AuditLog") bare.add(model);
      model = "";
    }
  }
  /**
   * Kept on purpose, each for a reason purge.ts states:
   *  - AiUsage: the platform's cost ledger, billed whether or not the tenant exists.
   *  - Template: SET NULL is on the CONTRIBUTOR link; a contributed template belongs to
   *    the library. (Owner-private templates cascade.)
   */
  const KEEP = new Set(["AiUsage", "Template"]);
  const camel = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  for (const m of [...setNull, ...bare].sort()) {
    if (KEEP.has(m)) {
      expect(`${m}: kept on purpose`, true);
      continue;
    }
    expect(`${m}: deleted by name in the purge`, purge.includes(`tx.${camel(m)}.deleteMany(`), `add tx.${camel(m)}.deleteMany({ where: t }) to purgeTenantEverywhere, or explain it in KEEP`);
  }
  expect("the schema scan found the SET NULL tables (sanity)", setNull.has("Assessment") && setNull.has("Submission"));
  expect("the schema scan found the bare-id tables (sanity)", bare.has("PageView") && bare.has("WebhookDelivery"));
  expect("subscription payments survive (the platform's revenue ledger)", purge.includes('purpose: { not: "subscription" }'));
  expect("the purge is one transaction", purge.includes("await prisma.$transaction(") && purge.includes("await tx.tenant.delete("));
  const txEnd = purge.indexOf("await tx.tenant.delete(");
  expect("domains are released AFTER the transaction commits", purge.indexOf("railwayDeleteCustomDomain(") > txEnd);
  expect("R2 objects are removed AFTER the transaction commits", purge.indexOf("storage.deletePrefix(") > txEnd);
  expect("vault credentials are read BEFORE the bucket rows are deleted", purge.indexOf("loadBucketCreds(") < purge.indexOf("await prisma.$transaction("));
  const actions = src("src/features/platform/actions.ts");
  expect("the console's permanent delete runs the full purge", actions.includes("await purgeTenantEverywhere(tenantId)") && !actions.includes("await prisma.tenant.delete({ where: { id: tenantId } })"));
}

console.log("\n=== One 'tenant may operate' check, in every queue and every save ===");
{
  const guards = src("src/lib/auth/guards.ts");
  expect("requireWorkspace applies the tenant state on both paths", (guards.match(/await applyTenantState\(user, /g) ?? []).length === 2);
  expect("a deleted workspace's admin is not bounced into a /dashboard loop", guards.includes('if (fresh.tenant?.deletedAt) redirect("/workspace-unavailable")'));
  expect("editDenied refuses a locked workspace", guards.includes("if (user.writeLocked) return { ok: false, error: user.writeLocked }"));
  const acting = src("src/lib/tenant/acting.ts");
  expect("resolveActingScope applies the tenant state", acting.includes("await applyTenantState(user, tenantId)"));
  expect("scopeEditDenied refuses a locked workspace", acting.includes("if (scope.user.writeLocked)"));
  expect("broadcasts skip a workspace that may not operate", (src("src/lib/broadcasts/run.ts").match(/tenantMayOperate\(b\.tenantId\)/g) ?? []).length === 2);
  expect("automations skip a workspace that may not operate", src("src/lib/automation/run.ts").includes("await tenantState(run.tenantId)"));
  expect("workflows hold a workspace that may not operate", src("src/lib/workflows/run.ts").includes("await tenantState(tenantId)"));
  expect("webhook retries hold a workspace that may not operate", src("src/lib/webhooks/retry.ts").includes("await tenantState(d.tenantId)"));
  const active = src("src/lib/tenant/active.ts");
  expect("SUSPENDED is read by the check", active.includes('t.status === "SUSPENDED"'));
  expect("the owner can suspend from the console", actions().includes("export async function setTenantSuspended("));
  function actions() {
    return src("src/features/platform/actions.ts");
  }
}

console.log("\n=== Public funnels: parked, suspended and over-plan do not serve ===");
{
  const page = src("src/app/a/[slug]/page.tsx");
  expect("the public page asks funnelNotServing", (page.match(/await notServing\(a\.tenantId, a\.id\)/g) ?? []).length === 2);
  const sub = src("src/features/assessment/actions/submission.ts");
  expect("START asks funnelNotServing", sub.includes("await funnelNotServing(assessment.tenantId, assessment.id)"));
  expect("COMPLETE asks funnelNotServing", sub.includes("await funnelNotServing(submission.tenantId, submission.assessmentId)"));
  expect("the split email screen asks funnelNotServing", src("src/features/assessment/actions/lead-split.ts").includes("await funnelNotServing(assessment.tenantId, assessment.id)"));
  const over = src("src/lib/billing/overage.ts");
  expect("over-plan keeps the EARLIEST published funnels live", over.includes('publishedAt: { sort: "asc"') && over.includes("live.slice(limit)"));
}

console.log("\n=== Plan caps cannot be beaten by two clicks ===");
{
  const sites: Array<[string, string, string]> = [
    ["src/features/assessment/actions/assessment.ts", "createAssessment", "assessments"],
    ["src/features/assessment/actions/assessment.ts", "duplicateAssessment", "assessments"],
    ["src/features/assessment/actions/import-text.ts", "createAssessmentFromText", "assessments"],
    ["src/features/templates/actions/library.ts", "importTemplate", "assessments"],
    ["src/features/assessment/actions/transfer.ts", "importTenantAssessments", "assessments"],
    ["src/features/admin/actions/ad-account.ts", "createAdAccount", "adAccounts"],
    ["src/features/admin/actions/staff.ts", "createStaff", "seats"],
    ["src/features/agency/actions.ts", "createAgencyTenant", "agencyTenants"],
    ["src/features/agency/actions.ts", "restoreAgencyTenant", "agencyTenants"],
    ["src/features/workspace/actions/domains.ts", "addDomain", "domains"],
  ];
  for (const [file, fn, kind] of sites) {
    const s = src(file);
    expect(`${fn} runs under the ${kind} cap lock`, s.includes(`return withCapLock("${kind}", () => ${fn}UnderCapLock(`) && s.includes(`async function ${fn}UnderCapLock(`));
  }
  expect("the cap lock is re-entrant (guided setup imports a template inside another action)", src("src/lib/db/cap-lock.ts").includes("if (mine?.has(key)) return run();"));
}

console.log("\n=== Audit log ===");
{
  const a = src("src/features/platform/actions.ts");
  for (const act of ["tenant.enter", "tenant.delete", "tenant.restore", "tenant.purge", "tenant.suspend", "plan.grant", "plan.limits", "user.password", "user.superadmin"]) {
    expect(`console records ${act}`, a.includes(`"${act}"`));
  }
  expect("break-glass recovery is recorded", src("src/app/api/admin/recover/route.ts").includes('action: "user.password"'));
  expect("the audit row survives the tenant (no foreign key)", !/model AuditLog \{[^}]*@relation/.test(src("prisma/schema.prisma")));
}

console.log("\n=== Import does not reveal other workspaces' addresses ===");
{
  const t = src("src/features/assessment/actions/transfer.ts");
  const tenantPart = t.slice(t.indexOf("/** Tenant preview"));
  expect("workspace preview reports only its OWN slugs", tenantPart.includes('(await slugHolder(a.slug, tenantId)) === "mine"'));
  expect("workspace import never lists another workspace's slug as a conflict", tenantPart.includes('if (holder === "elsewhere")') && !tenantPart.includes("await slugExists(body.slug)"));
}

console.log(failures === 0 ? "\nAll lifecycle checks passed." : `\n${failures} lifecycle check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
