/**
 * Which host may serve which funnel: verification.
 *
 * Pure, no database, so it runs in the build. Everything here is a statement about a
 * SECURITY BOUNDARY, which is why it is pinned rather than left to a live probe: the
 * leak it closes was invisible in status codes (every URL returned 200 on every host)
 * and was only visible by comparing rendered page titles. Nobody re-runs that by hand.
 *
 * The rule is IMPORTED, not reproduced - it lives in lib/tenant/public-host-rule.ts
 * precisely so this script checks the arithmetic the public routes actually run.
 *
 *   npx tsx scripts/verify-tenant-scope.ts
 */
import {
  funnelVisibleOnHost,
  ownerOrPlatformVisibleOnHost,
} from "../src/lib/tenant/public-host-rule";
import { PLATFORM_TENANT_ID } from "../src/lib/tenant/platform-tenant";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

/**
 * The production cast, as the database and Railway had it on 02-11-2026. The third
 * column is what `ownerHasOwnHost` is: a host RAILWAY ROUTES, not a Domain row.
 */
const GITA = "cmr6oz0ez0001nv1y0hv2zsl1"; // apply-gita: assess.applygitawisdom.com, routed
const COSMETIC = "cmrz46xaw0038p71y5nmat293"; // cosmetic-divine-leads: row, NOT routed
const TRIAL = "cmuw887ay003kli1yxd2qrvnw"; // deepak-singh: no domain at all
const PLATFORM_HOST = null; // assess360.divineleads.guru resolves to the root host

/** Whether each owner above has a WORKING host, as measured on 02-11-2026. */
const ROUTED = { [GITA]: true, [COSMETIC]: false, [TRIAL]: false } as const;

const funnel = (hostTenantId: string | null, ownerTenantId: string | null, ownerHasOwnHost: boolean) =>
  funnelVisibleOnHost({ hostTenantId, ownerTenantId, ownerHasOwnHost });
const result = (hostTenantId: string | null, ownerTenantId: string | null) =>
  ownerOrPlatformVisibleOnHost({ hostTenantId, ownerTenantId });

console.log("=== The leak, as reported (both of these were 200 in production) ===");
// assess.applygitawisdom.com/a/paying-for-junk-leads - the platform's own gate funnel
// served under Apply Gita's branding.
expect(
  "a tenant's domain does NOT serve the platform's own funnel",
  !funnel(GITA, PLATFORM_TENANT_ID, false),
);
// assess360.divineleads.guru/a/business-heads - a tenant's funnel served as ours.
expect(
  "the platform host does NOT serve a funnel whose owner has a ROUTED domain of its own",
  !funnel(PLATFORM_HOST, GITA, ROUTED[GITA]),
);

console.log("\n=== What must keep working (the owner's paid ads point here) ===");
expect(
  "a tenant's own domain serves its own funnel",
  funnel(GITA, GITA, ROUTED[GITA]),
);
expect(
  "the platform host serves the platform's own funnel",
  funnel(PLATFORM_HOST, PLATFORM_TENANT_ID, false),
);
expect(
  "a tenant with NO domain keeps its funnel on the platform host - its only address",
  funnel(PLATFORM_HOST, TRIAL, ROUTED[TRIAL]),
);

expect(
  "a tenant whose domain does not ROUTE yet keeps its funnels on the platform host",
  funnel(PLATFORM_HOST, COSMETIC, ROUTED[COSMETIC]),
  "cosmetic-divine-leads had a Domain row and no Railway route on 02-11-2026, so the " +
    "platform host was the only working address its three published funnels had",
);

console.log("\n=== Tenant against tenant, which is the crossover that was reported ===");
expect(
  "one tenant's domain does NOT serve another tenant's funnel",
  !funnel(GITA, COSMETIC, ROUTED[COSMETIC]),
);
expect(
  "nor a domain-less tenant's funnel, which the platform host does serve",
  !funnel(GITA, TRIAL, ROUTED[TRIAL]) && funnel(PLATFORM_HOST, TRIAL, ROUTED[TRIAL]),
);
expect(
  "an unrouted domain never becomes a host that serves other tenants' funnels either",
  !funnel(COSMETIC, GITA, ROUTED[GITA]) && !funnel(COSMETIC, PLATFORM_TENANT_ID, false),
);

console.log("\n=== The legacy null owner ===");
/*
 * 🔴 The one reading that must never creep in: null meaning "the funnel tenant". A
 * funnel created from /admin without entering a workspace is stamped null, and reading
 * that as a business tenant would serve it on that tenant's branded domain under the
 * wrong owner, silently. Null is the platform, which reaches no tenant's domain.
 */
expect(
  "an unowned funnel is the PLATFORM's, so the platform host serves it",
  funnel(PLATFORM_HOST, null, false) && funnel(PLATFORM_TENANT_ID, null, false),
);
expect(
  "and no tenant's domain serves it",
  !funnel(GITA, null, false) && !funnel(COSMETIC, null, false) && !funnel(TRIAL, null, false),
);
expect(
  "the two spellings of the platform are one owner, in both directions",
  funnel(PLATFORM_TENANT_ID, null, false) && funnel(PLATFORM_HOST, PLATFORM_TENANT_ID, false),
);

console.log("\n=== Result pages: the platform host always serves ===");
/*
 * Not a softening - every result link the product mints is built on the platform host
 * (lib/events/completion.ts), so the funnel rule here would 404 every link already in
 * a CRM and every one already sent. See public-host-rule.ts.
 */
expect(
  "the platform host serves a tenant's result, because that is where its link points",
  result(PLATFORM_HOST, GITA) && result(PLATFORM_TENANT_ID, GITA),
);
expect(
  "a tenant's own domain serves its own result",
  result(GITA, GITA),
);
expect(
  "one tenant's domain does NOT serve another tenant's result",
  !result(GITA, COSMETIC) && !result(COSMETIC, GITA) && !result(GITA, TRIAL),
);
expect(
  "nor the platform's own result",
  !result(GITA, PLATFORM_TENANT_ID) && !result(GITA, null),
);

console.log("\n=== The rule decides on the owner, never on the funnel's reachability ===");
/*
 * A funnel whose owner HAS a domain is off the platform host whether or not that domain
 * is certificate-verified, matching getCurrentTenant, which deliberately ignores the
 * `verified` flag because it tracks cert issuance and is known to go stale. The input
 * here is "has a Domain row", which is the same question that routing already answers.
 */
expect(
  "a ROUTED host is what moves a funnel off the platform host, nothing else",
  funnel(PLATFORM_HOST, TRIAL, false) && !funnel(PLATFORM_HOST, TRIAL, true),
);

console.log(failures === 0 ? "\n🟢 All checks passed." : `\n🟡 ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
