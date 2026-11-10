/**
 * White label, Phase 3 of the multi-tenant review (10-11-2026): verification.
 *
 * Pure, no database, so it runs in the build. What a tenant's RESPONDENT sees must be the
 * tenant's, and each fix below is a line a later edit could undo with no visible symptom
 * to the person making it: the checkout says Assess360 again, a report prints the Gita
 * band words again, a funnel on the platform address loses its owner's colours.
 *
 *   npx tsx --conditions=react-server scripts/verify-whitelabel.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tenantThemeCss } from "../src/lib/tenant/theme-css";
import { clinicSystemPrompt } from "../src/lib/ai/clinic-prompt";

let failures = 0;
const expect = (n: string, cond: boolean, d = "") => {
  if (cond) console.log(`  PASS  ${n}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${n}${d ? `\n        ${d}` : ""}`);
  }
};
const src = (p: string) => readFileSync(join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

console.log("=== Pure rules ===");
{
  expect("theme CSS takes strict hex", tenantThemeCss("#112233", "#445566") === ":root{--primary:#112233;--secondary:#445566;}.dark{--primary:#112233;}");
  expect("theme CSS refuses injected text", tenantThemeCss("red;}body{display:none", null) === null);
  const tenant = clinicSystemPrompt({ name: "Acme Clinics", isPlatform: false });
  expect("a tenant's clinic audit names the tenant", tenant.includes("produced by Acme Clinics.") && !tenant.includes("Divine Leads"));
  expect("the platform's clinic audit still names Divine Leads", clinicSystemPrompt({ name: "Assess360", isPlatform: true }).includes("produced by Divine Leads"));
  expect("no placeholder is left in the prompt", !tenant.includes("{{PRODUCER}}"));
}

console.log("\n=== Checkout and Meta events ===");
{
  const sub = src("src/features/assessment/actions/submission.ts");
  expect("the paid checkout is named for the tenant", sub.includes("name: brand.name,") && !sub.includes('PAYMENT_BUSINESS_NAME = "Assess360"'));
  expect("the paid checkout carries the tenant's logo and colour", sub.includes("image: brand.logoUrl,") && sub.includes("themeColor: brand.primaryColor,"));
  const send = src("src/lib/meta/send.ts");
  expect("tenant server events name the tenant's address", (send.match(/await withTenantSourceUrl\(input, tenantId\)/g) ?? []).length === 2);
}

console.log("\n=== Redirects that dropped respondents on the Assess360 homepage ===");
{
  expect("a removed result-page button returns to the result", src("src/app/api/cta/[submissionId]/[blockId]/route.ts").includes("if (!block) return NextResponse.redirect(ctaResultUrl(publicOrigin,"));
  expect("an onward click with no URL goes to the tenant's address", src("src/app/api/onward/[submissionId]/route.ts").includes("if (!target) return NextResponse.redirect(await publicOriginFor(sub.assessment.tenantId), 302)"));
  const ec = src("src/app/e/c/[id]/route.ts");
  expect("an email link that cannot be followed goes to the sender's address", (ec.match(/await homeFor\(id\)/g) ?? []).length === 2 && !ec.includes(": env.NEXT_PUBLIC_APP_URL;"));
}

console.log("\n=== PDF report ===");
{
  const r = src("src/lib/pdf/report.tsx");
  expect("no Assess360 in the report title or kicker", !r.includes("Your Assess360 Report") && !r.includes("`Assess360 Report - "));
  expect("no Gita band words on the scale", !/"Stable"|"Strained"|"Overwhelmed"/.test(r));
  expect("the closing line is a setting, not the clinical line", !r.includes("not a clinical diagnosis") && r.includes("DEFAULT_REPORT_DISCLAIMER"));
  const route = src("src/app/api/reports/[submissionId]/route.ts");
  expect("the file is named for the owner", route.includes('filename="${safeName(brandName)}_Report_') && !route.includes("Assess360_Report_"));
  expect("the funnel's own band titles feed the scale", route.includes("resultBands: { select: { level: true, title: true }") && route.includes("scaleLabels,"));
  expect("a stored report re-renders when the brand changes", route.includes('"brand-v1"') && route.includes("getStoredReport(submissionId, stampLines)"));
  expect("the logo is fetched with a cap, not by the renderer", src("src/lib/pdf/logo.ts").includes("AbortSignal.timeout(TIMEOUT_MS)"));
}

console.log("\n=== Icon, share image and colours follow the funnel's owner ===");
{
  const root = src("src/app/layout.tsx");
  expect("a tenant host shows the tenant's favicon", root.includes("icons: { icon: favicon"));
  const lay = src("src/app/a/[slug]/layout.tsx");
  expect("a funnel wears its owner's colours on any host", lay.includes("tenantThemeCss(brand.primaryColor, brand.secondaryColor)"));
  expect("a funnel shows its owner's favicon on any host", lay.includes("export async function generateMetadata("));
  const page = src("src/app/a/[slug]/page.tsx");
  expect("a funnel's share card falls back to the owner's share image", page.includes("?? brand.shareImageUrl") && page.includes("openGraph:"));
  expect("a business funnel's title never ends in Assess360", page.includes("{ absolute: `${a.title} · ${brand.name}` }"));
}

console.log("\n=== Legal links and reply-to ===");
{
  const links = src("src/lib/tenant/legal-links.ts");
  expect("a business tenant never gets the platform's policy pages", /if \(!isBusinessTenant\(tenantId\)\) \{[\s\S]*?\/privacy[\s\S]*?\}\s*const row/.test(links));
  expect("funnel and result pages carry the owner's legal footer", src("src/app/a/[slug]/layout.tsx").includes("<TenantLegalFooter tenantId={tenantId} />"));
  expect("booking pages carry the owner's legal footer", src("src/app/b/[slug]/page.tsx").includes("<TenantLegalFooter tenantId={owner} />"));
  expect("result-page footer drops links with no address", src("src/features/assessment/components/public/vsl-result-page.tsx").includes('.trim() && normalizeHref(l.url))'));
  const mail = src("src/lib/nurture/send.ts");
  expect("every email carries the sender's reply-to", mail.includes("opts?.replyTo ?? (await defaultReplyTo(tenantId))"));
  const gate = src("src/lib/billing/gate.ts");
  expect("a business tenant's respondent is never shown the platform inbox", gate.includes("return clean(s?.supportEmail) ?? clean(s?.replyToEmail);"));
}

console.log("\n=== The owner's details are not placeholders on tenant screens ===");
{
  expect("sender From name", !src("src/features/nurture/components/nurture-connection-settings.tsx").includes('placeholder="Ganga Narayan Das"'));
  expect("payment description", !src("src/features/workspace/components/integration-settings-form.tsx").includes("Divine Leads"));
  expect("onboarding business name", !src("src/features/onboarding/steps.ts").includes('placeholder: "Divine Leads"'));
  expect("API help names gita_mentor only where it can be minted", src("src/features/api-tokens/components/api-tokens-manager.tsx").includes('scopes.some((s) => s.value === "gita_mentor")'));
}

console.log(failures === 0 ? "\nAll white-label checks passed." : `\n${failures} white-label check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
