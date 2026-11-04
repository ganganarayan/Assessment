import { isPlatformScope } from "@/lib/tenant/platform-tenant";

/**
 * WHICH HOST MAY SERVE WHICH FUNNEL - the decision, as arithmetic.
 *
 * Deliberately pure: no database, no request, no `server-only`, nothing from Next. It
 * lives apart from lib/tenant/public-scope.ts (which resolves the inputs and is
 * server-only) for the same reason the gate's band arithmetic lives apart from its
 * action: so `verify:tenant-scope` can assert the rule the public routes actually run,
 * in the build, without a database. A security boundary whose only test is "curl it in
 * production afterwards" is one nobody re-checks.
 *
 * 🔴 THE BUG THIS RULE EXISTS TO KILL. `Assessment.slug` is `@unique` GLOBALLY and the
 * public read matched on slug alone, so every funnel answered on every hostname. On
 * 02-11-2026 all of these returned 200 in production:
 *
 *   assess.applygitawisdom.com/a/paying-for-junk-leads  <- the PLATFORM's gate funnel,
 *                                                          served under Apply Gita's
 *                                                          branding
 *   assess.applygitawisdom.com/a/prediction             <- ANOTHER TENANT's funnel,
 *                                                          likewise
 *   assess360.divineleads.guru/a/business-heads         <- a tenant's funnel served as
 *                                                          the platform's own
 *
 * and the brand suffix in the <title> came from the request host rather than from the
 * funnel's owner, because the layout brands by host while the read did not scope by it.
 * One tenant's ad creative, headline and offer were reachable - and indexable - on
 * another tenant's domain.
 *
 * 🟢 WHY A COMPARISON AND NOT A WHERE CLAUSE. The slug is globally unique, so the
 * cached row for a slug is correct and shared by every host; the cache key is the slug
 * alone. Adding the tenant to the WHERE clause while leaving a slug-keyed cache in
 * front of it is how you serve one tenant's funnel out of another tenant's cache entry
 * - a worse bug than the one being fixed, and an intermittent one. The read is left
 * exactly as it was and the owner is compared with the host afterwards.
 */

/** `null` for either side means the legacy pre-re-home spelling of the platform. */
export interface HostScopeInput {
  /** Owner of the hostname this request arrived on; null = the root/platform host. */
  hostTenantId: string | null;
  /** Owner of the funnel or result being asked for. */
  ownerTenantId: string | null;
}

/**
 * May this hostname serve this funnel?
 *
 * `ownerHasOwnHost` is 🔴 LOAD-BEARING, not a softening. Tenant subdomains do not
 * resolve (`<slug>.<root>` has no DNS and Railway routes no wildcard - checked
 * 02-11-2026), and a routed custom domain exists only for tenants who have brought one
 * and got it attached. So for every other tenant - which is every trial, from signup
 * until they buy a domain - THE PLATFORM HOST IS THE ONLY HOST THEIR FUNNEL HAS.
 * "Serve a funnel on its owner's host only" reads as the strict rule right up to the
 * moment it 404s a paying tenant's live funnel off the one address it ever had, with
 * their ad spend still pointing at it.
 *
 * 🔴 AND IT MUST MEAN ROUTED, NOT CONFIGURED. A Domain row is an intention; routing is
 * the fact. On 02-11-2026 cosmetic-divine-leads had a row for assess.divineleads.guru
 * with DNS pointed, and the host still answered Railway's "Application not found",
 * because the service's custom-domain cap had been reached - so its three published
 * funnels had exactly one working address, the platform's. Taking the row as a home
 * would have taken all three offline. The caller therefore asks Railway's routed list,
 * not the Domain table.
 *
 * So the platform host stays the fallback home for an owner that has no working home of
 * its own, and stops being it the moment one starts routing. That is self-healing in
 * the right direction and it matches `tenantCanonicalOrigin`, which names the tenant's
 * own domain when there is one and the platform's when there is not.
 *
 * 🔴 A null owner is read as the PLATFORM, never as the owner's own funnel tenant. A
 * funnel created from /admin without entering a workspace is stamped null, and reading
 * null as a business tenant would serve it on that tenant's branded domain under the
 * wrong owner, silently. Platform is both the established convention (see
 * platform-tenant.ts) and the safe direction: it reaches no tenant's domain.
 */
export function funnelVisibleOnHost(
  input: HostScopeInput & { ownerHasOwnHost: boolean },
): boolean {
  const hostIsPlatform = isPlatformScope(input.hostTenantId);
  const ownerIsPlatform = isPlatformScope(input.ownerTenantId);

  // Its own host. Both spellings of the platform collapse to one owner here.
  if (ownerIsPlatform ? hostIsPlatform : input.hostTenantId === input.ownerTenantId) return true;

  // The platform host is home to an owner that has no host of its own.
  if (hostIsPlatform && !ownerIsPlatform && !input.ownerHasOwnHost) return true;

  // Anything else is one tenant's hostname asking for a funnel that is not theirs.
  return false;
}

/**
 * May this hostname serve a page WHOSE LINK THIS PRODUCT MINTED - a result page, a
 * booking page? Laxer than the funnel rule in exactly one way: the platform host
 * always serves.
 *
 * 🔴 WHY, CONCRETELY. New links are built on the tenant's own home (see
 * lib/tenant/public-origin.ts), but every link minted before that moved was built on the
 * PLATFORM host. So the live link for all 789 Apply Gita submissions, the ones sitting in
 * the CRM and in already-sent WhatsApp and email nurture, is on
 * assess360.divineleads.guru. Applying the funnel rule here would 404 every one of them:
 * a worse outcome than the leak, and not recoverable by the people holding the links.
 * It is also where a new link lands when a tenant's own domain fails its live check.
 *
 * What this still closes is the crossover that was reported: ONE TENANT'S DOMAIN
 * SERVING ANOTHER TENANT'S page - a respondent's name and score, or another tenant's
 * name and free appointment slots.
 */
export function ownerOrPlatformVisibleOnHost(input: HostScopeInput): boolean {
  // The platform host is where the links are made, so it is where they must work.
  if (isPlatformScope(input.hostTenantId)) return true;
  if (isPlatformScope(input.ownerTenantId)) return false;
  return input.hostTenantId === input.ownerTenantId;
}

/**
 * Which of a tenant's hosts its links are built on: the first LIVE one, given best first
 * (Primary, then oldest). Null sends the caller to the platform address. A configured host
 * that is not live never wins, however highly it ranks, because a link built on it is dead.
 */
export function chooseHomeHost(
  hostsBestFirst: readonly string[],
  isLive: (host: string) => boolean,
): string | null {
  return hostsBestFirst.find(isLive) ?? null;
}

/**
 * Did this body come from Assess360's own /api/version? A status code cannot answer that:
 * a rewritten request returns a healthy 200 from the wrong app. Same test as
 * scripts/verify-zone.ts.
 */
export function answersAsThisApp(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  return "commit" in body && "branch" in body && "deploymentId" in body;
}
