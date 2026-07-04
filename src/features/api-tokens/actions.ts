"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, tenantScope } from "@/lib/tenant/acting";
import { generateApiToken } from "@/lib/api-auth/token";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { isApiTokenScope, type ApiTokenRow } from "@/features/api-tokens/scopes";

export async function listApiTokens(tenantId: string | null): Promise<ActionResult<ApiTokenRow[]>> {
  const rows = await prisma.apiToken.findMany({
    where: { tenantId },
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
 * Platform-owned (tenantId null) for now — the tenant column is ready for when
 * tenant admins mint their own scoped keys.
 */
export async function mintApiToken(scope: string, label: string): Promise<ActionResult<{ token: string }>> {
  const acting = await resolveActingScope();
  if (!acting.isSuper && !acting.tenantId) return { ok: false, error: "No workspace." };
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

/** Revoke (soft) — the token stops authenticating immediately. */
export async function revokeApiToken(id: string): Promise<ActionResult> {
  const acting = await resolveActingScope();
  const owned = await prisma.apiToken.findFirst({ where: { id, ...tenantScope(acting) }, select: { id: true } });
  if (!owned) return { ok: false, error: "Token not found." };
  await prisma.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
  revalidatePath("/admin/api-tokens");
  revalidatePath("/w/api");
  return { ok: true };
}
