/**
 * Phases 4 and 5 of the multi-tenant review (11-11-2026): verification.
 *
 * Pure, no database, so it runs in the build. Phase 4 lets a tenant sell outside India
 * (its own timezone for respondents, its own payment currency). Phase 5 makes the
 * workspace honest for staff and agencies. The booking slot maths has its own suite
 * (verify:calendar); this one covers the money, the settings and the pinned fixes.
 *
 *   npx tsx --conditions=react-server scripts/verify-region-roles.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatMoney, toMinor, toMajor, currencyOr, minChargeMinor, formatMajor } from "../src/lib/region/money";
import { zoneOffsetMin, formatInZone, zoneOr, isValidTimeZone, zoneLabel } from "../src/lib/region/zone";

let failures = 0;
const expect = (n: string, cond: boolean, d = "") => {
  if (cond) console.log(`  PASS  ${n}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${n}${d ? `\n        ${d}` : ""}`);
  }
};
const src = (p: string) => readFileSync(join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

console.log("=== Money (lib/region/money) ===");
{
  expect("INR uses Indian grouping", formatMoney(19999900, "INR") === "₹1,99,999");
  expect("USD shows cents", formatMoney(1999, "USD") === "$19.99");
  expect("major to minor", toMinor(19.99, "USD") === 1999 && toMinor(199, "INR") === 19900);
  expect("minor to major", toMajor(1999, "USD") === 19.99);
  expect("an unknown code falls back to INR", currencyOr("XYZ") === "INR" && currencyOr(null) === "INR");
  expect("each currency has its own minimum", minChargeMinor("INR") === 100 && minChargeMinor("USD") === 50);
  expect("formatMajor for figures already divided", formatMajor(1500, "INR") === "₹1,500");
}

console.log("\n=== Timezones (lib/region/zone) ===");
{
  const july = Date.UTC(2026, 6, 1, 12, 0);
  const jan = Date.UTC(2026, 0, 1, 12, 0);
  expect("IST is +330 all year", zoneOffsetMin("Asia/Kolkata", july) === 330 && zoneOffsetMin("Asia/Kolkata", jan) === 330);
  expect("New York follows daylight saving", zoneOffsetMin("America/New_York", july) === -240 && zoneOffsetMin("America/New_York", jan) === -300);
  expect("house format in the zone", formatInZone(july, "Asia/Kolkata") === "01-07-2026 17:30");
  expect("an invalid zone falls back to IST", zoneOr("Mars/Base") === "Asia/Kolkata" && !isValidTimeZone("not a zone"));
  expect("IST is labelled IST", zoneLabel("Asia/Kolkata") === "IST");
}

console.log("\n=== Phase 4: respondents pay in the tenant's currency ===");
{
  const sub = src("src/features/assessment/actions/submission.ts");
  expect("the funnel checkout uses the tenant's currency", sub.includes("const currency = await tenantCurrency(opts.tenantId);") && !/currency: "INR",\n\s+notes: \{ submissionId: opts\.submissionId/.test(sub));
  const verify = src("src/app/api/payments/verify/route.ts");
  expect("verify compares in the order's currency", verify.includes("toMinor(s.assessment.paymentAmount, currency)") && !verify.includes('currency: "INR"'));
  const links = src("src/features/payments/actions/payment-links.ts");
  expect("a payment link snapshots the currency it was made in", links.includes("const currency = await tenantCurrency(sub.tenantId);") && links.includes("      currency,\n"));
  const order = src("src/features/payments/actions/pay-order.ts");
  expect("paying a link charges in the link's currency", order.includes("currency: link.currency,") && !order.includes('currency: "INR"'));
  expect("the pay page shows the link's currency", src("src/app/pay/[token]/page.tsx").includes("currency={link.currency}"));
  expect("workspace stats show the tenant's currency", !src("src/app/w/stats/page.tsx").includes("₹{s."));
  expect("the Region card exists on both settings screens", src("src/app/w/settings/page.tsx").includes("<RegionForm") && src("src/app/admin/settings/page.tsx").includes("<RegionForm"));
  const schema = src("prisma/schema.prisma");
  expect("schema carries the region and the link currency", schema.includes("timeZone         String?") && schema.includes("paymentCurrency  String?") && schema.includes('currency String @default("INR")'));
}

console.log("\n=== Phase 5: staff ===");
{
  const layout = src("src/app/w/layout.tsx");
  expect("staff menu hides the owner-only screens", layout.includes('"/w/staff", "/w/billing", "/w/api", "/w/agency-tenants"'));
  expect("the workflow logs link hides with workflows", src("src/lib/features/catalog.ts").includes('routes: ["/w/workflows", "/w/workflows/logs"]'));
  for (const f of ["broadcasts/[id]", "workflows/[id]", "result-pages/[id]", "nurture", "webhooks", "operations", "data-window", "ai"]) {
    expect(`view-only staff get a disabled ${f} editor`, src(`src/app/w/${f}/page.tsx`).includes("<ViewOnly readOnly={readOnly}>"));
  }
  expect("view-only staff get disabled settings forms", (src("src/app/w/settings/page.tsx").match(/<ViewOnly readOnly=\{readOnly\} bare>/g) ?? []).length >= 10);
  expect("view-only staff can preview a funnel instead of a dead Edit", src("src/app/w/assessments/page.tsx").includes("href={`/a/${a.slug}?preview=1`}"));
}

console.log("\n=== Phase 5: agencies ===");
{
  const agency = src("src/lib/tenant/agency.ts");
  expect("agency staff cannot work inside a client workspace", agency.includes("if (!who || who.staffPermission !== null) return null;"));
  const actions = src("src/features/agency/actions.ts");
  expect("only the agency owner can Enter a client", actions.includes('if (!scope.isOwner) redirect("/w/agency-tenants");'));
  expect("the agency list carries a 30-day count per client", actions.includes("recentCount: recent.get(t.id) ?? 0,"));
  expect("a client's Staff page lists the client's staff", src("src/features/admin/actions/staff.ts").includes("return { user, isSuper, ownTenant: entered ?? own };"));
  expect("an agency owner inside a client sees that client's logins", src("src/app/w/settings/page.tsx").includes("const operatingOther = impersonating || viaAgency;"));
}

console.log("\n=== Phase 5: smaller gaps ===");
{
  expect("workspace stats filter to one funnel", src("src/app/w/stats/page.tsx").includes('<AssessmentPicker assessments={assessmentOptions} selectedId={scoped?.id ?? null} basePath="/w/stats" />'));
  expect("the workspace pixel tester offers the event list", src("src/app/w/pixel-test/page.tsx").includes("events={eventChoices}"));
  const ab = src("src/lib/events/abandoned.ts");
  expect("both abandoned sweeps judge each workspace on its own hours", (ab.match(/await cutoffGroups\(\)/g) ?? []).length === 2 && !ab.includes('findUnique({ where: { id: "singleton" } })'));
  const act = src("src/features/events/actions/settings.ts");
  expect("saving the hours writes the acting workspace, not the platform", act.includes("where: appSettingWhere(tenantId),") && !act.includes('where: { id: "singleton" }'));
}

console.log(failures === 0 ? "\nAll Phase 4 and 5 checks passed." : `\n${failures} Phase 4/5 check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
