/**
 * Cross-tenant isolation, Phase 1 of the multi-tenant review (10-11-2026): verification.
 *
 * Pure, no database, so it runs in the build. Two kinds of check:
 *
 *  1. The pure helpers are EXERCISED: the intake throttle and the email click-link
 *     signature, imported from the modules the app runs.
 *  2. The fixes that live inside database code are PINNED by a source scan, because
 *     each one is a single line that a later edit could quietly undo, and the leak it
 *     closes is invisible in any status code: the wrong tenant's row simply comes back.
 *
 *   npx tsx --conditions=react-server scripts/verify-isolation.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { intakeAllowed, INTAKE_LIMITS } from "../src/lib/rate-limit-intake";
import { trackedUrlSignature, trackedUrlSignatureValid, encodeTrackedUrl } from "../src/lib/nurture/tracking";

let failures = 0;
const expect = (n: string, cond: boolean, d = "") => {
  if (cond) console.log(`  PASS  ${n}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${n}${d ? `\n        ${d}` : ""}`);
  }
};
const src = (p: string) => readFileSync(join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

console.log("=== Intake throttle (lib/rate-limit-intake) ===");
{
  const limit = INTAKE_LIMITS.start.limit;
  let allowed = 0;
  for (let i = 0; i < limit + 5; i++) if (intakeAllowed("start", "203.0.113.7", "funnel-a")) allowed += 1;
  expect(`one IP gets exactly ${limit} starts into one funnel`, allowed === limit, `got ${allowed}`);
  expect("the same IP is NOT throttled on a different funnel", intakeAllowed("start", "203.0.113.7", "funnel-b"));
  expect("a different IP on the same funnel is NOT throttled", intakeAllowed("start", "203.0.113.8", "funnel-a"));
  expect("START and COMPLETE count separately", intakeAllowed("complete", "203.0.113.7", "funnel-a"));
  let unknown = 0;
  for (let i = 0; i < limit * 3; i++) if (intakeAllowed("start", null, "funnel-a")) unknown += 1;
  expect("an unknown IP is never throttled (no shared bucket to poison)", unknown === limit * 3);
  expect("the limits stay generous enough for carrier NAT", INTAKE_LIMITS.start.limit >= 30 && INTAKE_LIMITS.complete.limit >= 30);
}

console.log("\n=== Email click-link signature (lib/nurture/tracking) ===");
{
  const secret = "x".repeat(32);
  const u = encodeTrackedUrl("https://example.com/offer");
  const sig = trackedUrlSignature("log-1", u, secret);
  expect("a link we signed verifies", trackedUrlSignatureValid("log-1", u, sig, secret));
  expect("a changed destination fails", !trackedUrlSignatureValid("log-1", encodeTrackedUrl("https://evil.example"), sig, secret));
  expect("the same destination under another email id fails", !trackedUrlSignatureValid("log-2", u, sig, secret));
  expect("a truncated signature fails without throwing", !trackedUrlSignatureValid("log-1", u, sig.slice(0, 5), secret));
  expect("another secret fails", !trackedUrlSignatureValid("log-1", u, sig, "y".repeat(32)));
  const route = src("src/app/e/c/[id]/route.ts");
  expect("the click route checks the signature", route.includes("trackedUrlSignatureValid("));
  expect("outgoing emails are signed", src("src/lib/nurture/send.ts").includes("env.BETTER_AUTH_SECRET"));
}

console.log("\n=== Pinned fixes (source scan) ===");
{
  const hook = src("src/lib/payments/razorpay-webhook.ts");
  expect(
    "Razorpay webhook: a business tenant's webhook only touches that tenant's link and submission",
    hook.includes("const ownsRow =") && hook.includes("!ownsRow(link.tenantId)") && hook.includes("ownsRow(found.tenantId)"),
  );

  const capi = src("src/lib/meta/capi-log.ts");
  expect(
    "CAPI attribution: findSubmission takes the tenant fence and every call passes one",
    /async function findSubmission\(submissionId: string \| null, email: string \| null, tenantId: string \| null\)/.test(capi) &&
      (capi.match(/findSubmission\(/g) ?? []).length === (capi.match(/findSubmission\([^)]*,[^)]*,[^)]*\)/g) ?? []).length,
  );

  const q = src("src/features/assessment/actions/question.ts");
  const restore = q.slice(q.indexOf("export async function restoreOptions"));
  expect(
    "restoreOptions authorises EVERY option, not just the first",
    restore.includes("owners.length !== ids.length") && !restore.slice(0, 1500).includes("where: { id: clean[0]"),
  );

  const tokens = src("src/features/api-tokens/actions.ts");
  expect("listApiTokens takes no tenant argument from the browser", tokens.includes("export async function listApiTokens()"));
  expect("API tokens are owner-only", (tokens.match(/scopeOwnerDenied\(acting\)/g) ?? []).length >= 3);

  expect(
    "Purchase event-id lookup is fenced to the owner's tenants",
    src("src/lib/api-data/purchase-eventid.ts").includes("OR: await ownerTenantFence("),
  );

  expect(
    "Export reads the AI prompt version through the funnel's own tenant",
    src("src/features/assessment/transfer/export.ts").includes("where: { id: a.aiPromptVersionId, ...ownedWhere(a.tenantId) }"),
  );

  const staff = src("src/features/admin/actions/staff.ts");
  expect(
    "Staff: a tenant admin with no tenant matches nobody, and never a super admin",
    staff.includes("ownTenant !== null && target.tenantId === ownTenant && target.role !== \"SUPER_ADMIN\"") &&
      (staff.match(/tenantAdminMayTouch\(ownTenant, target\)/g) ?? []).length === 2,
  );

  const subscribe = src("src/features/billing/actions/subscribe.ts");
  expect("Plan checkout, verify and cancel are owner-only", (subscribe.match(/scopeOwnerDenied\(scope\)/g) ?? []).length === 3 && !subscribe.includes("scopeEditDenied"));
  expect("Extra workspace slots are owner-only", src("src/features/billing/actions/slots.ts").includes("if (isStaff(user))"));
  expect("Client workspace create/remove/restore are owner-only", (src("src/features/agency/actions.ts").match(/if \(!scope\.isOwner\)/g) ?? []).length === 3);
  expect("Lifecycle mutations refuse platform staff", (src("src/features/platform/lifecycle.ts").match(/if \(isStaff\(await requireSuperAdmin\(\)\)\) return;/g) ?? []).length === 5);

  const sub = src("src/features/assessment/actions/submission.ts");
  expect(
    "Public START and COMPLETE are throttled",
    sub.includes('intakeAllowed("start"') && sub.includes('intakeAllowed("complete"'),
  );
}

console.log(failures === 0 ? "\nAll isolation checks passed." : `\n${failures} isolation check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
