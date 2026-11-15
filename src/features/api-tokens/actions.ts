"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, configTenantOf, scopeOwnerDenied } from "@/lib/tenant/acting";
import { ownedWhere, PLATFORM_TENANT_ID } from "@/lib/tenant/platform-tenant";
import { tenantCan } from "@/lib/billing/entitlements";
import { generateApiToken } from "@/lib/api-auth/token";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { isApiTokenScope, isMcpTokenScope, MCP_TOKEN_SCOPES, WORKSPACE_MCP_SCOPE, type ApiTokenRow } from "@/features/api-tokens/scopes";
import { mcpWorkspaceEligibility } from "@/mcp/core/eligibility";

/**
 * The caller's own tokens. The scope is resolved HERE, never taken as an argument:
 * this is a server action the browser calls to refresh the list, so a tenant id
 * parameter let anyone, signed in or not, list any workspace's tokens (label, scope,
 * prefix, last used) by naming it. Owner admins only, like minting.
 */
export async function listApiTokens(): Promise<ActionResult<ApiTokenRow[]>> {
  const acting = await resolveActingScope();
  const notOwner = scopeOwnerDenied(acting);
  if (notOwner) return notOwner;
  if (!acting.isSuper && !acting.tenantId) return { ok: false, error: "No workspace." };
  const rows = await prisma.apiToken.findMany({
    // ownedWhere, not the acting where-fragment: the platform's tokens were minted with
    // a null tenant (mint stamps the raw acting id), and the platform is matched in both
    // spellings.
    where: ownedWhere(configTenantOf(acting)),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      prefix: true,
      scope: true,
      label: true,
      tenantId: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return {
    ok: true,
    data: rows.map((r) => ({
      ...r,
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/**
 * Mint a token: returns the PLAINTEXT exactly once (only the hash is stored).
 * Platform-owned (tenantId null) for now - the tenant column is ready for when
 * tenant admins mint their own scoped keys.
 */
export async function mintApiToken(scope: string, label: string): Promise<ActionResult<{ token: string }>> {
  const acting = await resolveActingScope();
  const denied = scopeOwnerDenied(acting);
  if (denied) return denied;
  if (!acting.isSuper && !acting.tenantId) return { ok: false, error: "No workspace." };
  if (!isApiTokenScope(scope)) return { ok: false, error: "Unknown scope." };
  if (isMcpTokenScope(scope)) return mintMcpToken(acting, scope, label);
  // Billing gate: API access is an Agency capability. The app owner (super admin) is
  // never limited; a tenant needs the apiAccess feature to mint keys.
  if (!acting.isSuper && !(await tenantCan(acting.tenantId, "apiAccess"))) {
    return { ok: false, error: "API access is part of Agency. Upgrade your plan to mint API keys." };
  }
  const { plaintext, tokenHash, prefix } = generateApiToken(scope);
  // Stamp the acting tenant. Endpoints (meta-match, mentor) already filter their
  // data by the token's tenantId, so a tenant's token only ever sees its own leads.
  await prisma.apiToken.create({
    data: { tokenHash, prefix, scope, label: label.trim() || null, createdById: acting.user.id, tenantId: acting.tenantId },
  });
  revalidatePath("/admin/api-tokens");
  revalidatePath("/w/api");
  return { ok: true, data: { token: plaintext } };
}

/**
 * Mint the workspace's MCP key (Claude connection).
 *
 * Different from the data keys above, by the owner's rules (14-11-2026):
 *  - every PAID plan may hold one (mcpWorkspaceEligibility), not only Agency
 *  - ONE active MCP key per workspace; an agency's one key also reaches its clients, so a
 *    client workspace never mints its own
 *  - the owner's key is always stamped on the Platform workspace, whatever workspace they
 *    happen to be inside, because it reaches every workspace anyway
 * The key acts as the login that minted it (createdById), which is always an owner login.
 */
async function mintMcpToken(
  acting: Awaited<ReturnType<typeof resolveActingScope>>,
  scope: string,
  label: string,
): Promise<ActionResult<{ token: string }>> {
  const tenantId = acting.isSuper ? PLATFORM_TENANT_ID : configTenantOf(acting);
  if (!acting.isSuper) {
    if (scope !== WORKSPACE_MCP_SCOPE) return { ok: false, error: "A workspace's Claude key is always read and write. Pick \"Claude (MCP), read and write\"." };
    if (acting.viaAgency) return { ok: false, error: "A client workspace is reached through its agency's MCP key. Mint it in the agency's own workspace." };
    const allowed = await mcpWorkspaceEligibility(tenantId);
    if (!allowed.ok) return { ok: false, error: allowed.reason };
  }
  const existing = await prisma.apiToken.findFirst({
    where: { tenantId, scope: { in: [...MCP_TOKEN_SCOPES] }, revokedAt: null },
    select: { prefix: true },
  });
  if (existing) {
    return { ok: false, error: `This workspace already has an MCP key (${existing.prefix}). Revoke it first, then mint a new one.` };
  }
  const { plaintext, tokenHash, prefix } = generateApiToken(scope);
  await prisma.apiToken.create({
    data: { tokenHash, prefix, scope, label: label.trim() || null, createdById: acting.user.id, tenantId },
  });
  revalidatePath("/admin/api-tokens");
  revalidatePath("/w/api");
  return { ok: true, data: { token: plaintext } };
}

/** Revoke (soft) - the token stops authenticating immediately. */
export async function revokeApiToken(id: string): Promise<ActionResult> {
  const acting = await resolveActingScope();
  const denied = scopeOwnerDenied(acting);
  if (denied) return denied;
  const owned = await prisma.apiToken.findFirst({ where: { id, ...ownedWhere(configTenantOf(acting)) }, select: { id: true } });
  if (!owned) return { ok: false, error: "Token not found." };
  await prisma.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
  revalidatePath("/admin/api-tokens");
  revalidatePath("/w/api");
  return { ok: true };
}
