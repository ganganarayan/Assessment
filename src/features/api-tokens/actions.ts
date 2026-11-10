"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, configTenantOf, scopeOwnerDenied } from "@/lib/tenant/acting";
import { ownedWhere } from "@/lib/tenant/platform-tenant";
import { tenantCan } from "@/lib/billing/entitlements";
import { generateApiToken } from "@/lib/api-auth/token";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { isApiTokenScope, type ApiTokenRow } from "@/features/api-tokens/scopes";

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
  // Billing gate: API access is an Agency capability. The app owner (super admin) is
  // never limited; a tenant needs the apiAccess feature to mint keys.
  if (!acting.isSuper && !(await tenantCan(acting.tenantId, "apiAccess"))) {
    return { ok: false, error: "API access is part of Agency. Upgrade your plan to mint API keys." };
  }
  if (!isApiTokenScope(scope)) return { ok: false, error: "Unknown scope." };
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
