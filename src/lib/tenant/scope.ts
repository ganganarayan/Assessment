/**
 * Data scope as a TYPE, not a nullable string.
 *
 * THE BUG THIS EXISTS TO KILL
 * Scope used to be `tenantId: string | null`, and `null` was read two opposite
 * ways depending on the file:
 *
 *   - the read paths (analytics, contacts, stats) pinned `tenantId: null`
 *     literally — meaning "the platform's OWN rows"
 *   - the write paths (tenantScope) turned it into `{}`
 *     — meaning "every tenant, show everything"
 *
 * Same value, contradictory meanings, so the same scope produced a populated
 * Submissions list and an empty Stats page. Making the two cases separate
 * variants of a union means they cannot collide again: there is no value that
 * could be read as either.
 *
 * NOTE there is deliberately no "platform" variant. The platform is an ordinary
 * tenant with a known id (see platform-tenant.ts), so it is `{ kind: "tenant",
 * tenantId: PLATFORM_TENANT_ID }` like any other. "All tenants" is the only
 * genuinely different shape, and it gets its own variant.
 */

/** One tenant's rows, every tenant's rows, or (transitionally) the unowned ones. */
export type Scope =
  | { kind: "tenant"; tenantId: string }
  /** Super admin who has not entered a workspace: the whole platform, all tenants. */
  | { kind: "all" }
  /**
   * TRANSITIONAL: rows still carrying `tenantId = null`, from before the re-home.
   *
   * This is the one place the old null survives, and it is here because it is a real
   * state of the data, not a meaning: until the backfill runs, some rows genuinely have
   * no owner. It is reached only via `ownerScopeOf()`, for questions of the form "the
   * other rows belonging to whoever owns this one" — e.g. which assessments a routing
   * rule may jump to. Answering that with `all` would offer another tenant's rows as
   * targets; answering it with the Platform tenant would return nothing at all while
   * the rows are still unowned.
   *
   * Delete this variant when the columns become NOT NULL. Nothing else should ever
   * construct it.
   */
  | { kind: "unowned" };

/** Scope for exactly one tenant. */
export function tenantOnly(tenantId: string): Scope {
  return { kind: "tenant", tenantId };
}

/** Scope across every tenant (super admin, no workspace entered). */
export const ALL_TENANTS: Scope = { kind: "all" };

/**
 * Prisma where-fragment for a scope. Spread it into a where clause:
 *   where: { ...whereScope(scope), status: "COMPLETED" }
 *
 * `{ kind: "all" }` contributes NO tenant filter, which is the whole point of the
 * variant being explicit — an unscoped read is now something a caller asks for by
 * name rather than something a null falls into.
 */
export function whereScope(scope: Scope): { tenantId?: string | null } {
  if (scope.kind === "tenant") return { tenantId: scope.tenantId };
  if (scope.kind === "unowned") return { tenantId: null };
  return {};
}

/**
 * The scope of "everything owned by whoever owns this row", given that row's stored
 * `tenantId`. An owned row yields its tenant; a row still unowned from before the
 * re-home yields the transitional `unowned` scope, so sibling lookups keep matching
 * the same set the row itself belongs to.
 *
 * This is NOT for resolving a caller's permissions — use the acting scope for that.
 */
export function ownerScopeOf(tenantId: string | null | undefined): Scope {
  return tenantId ? tenantOnly(tenantId) : { kind: "unowned" };
}

/** True when the scope is a single tenant (i.e. a workspace is being operated). */
export function isSingleTenant(scope: Scope): scope is { kind: "tenant"; tenantId: string } {
  return scope.kind === "tenant";
}
