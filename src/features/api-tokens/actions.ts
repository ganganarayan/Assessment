"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { generateApiToken } from "@/lib/api-auth/token";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { isApiTokenScope, type ApiTokenRow } from "@/features/api-tokens/scopes";

export async function listApiTokens(): Promise<ActionResult<ApiTokenRow[]>> {
  await requireSuperAdmin();
  const rows = await prisma.apiToken.findMany({
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
  const user = await requireSuperAdmin();
  if (!isApiTokenScope(scope)) return { ok: false, error: "Unknown scope." };
  const { plaintext, tokenHash, prefix } = generateApiToken(scope);
  await prisma.apiToken.create({
    data: { tokenHash, prefix, scope, label: label.trim() || null, createdById: user.id },
  });
  revalidatePath("/admin/api-tokens");
  return { ok: true, data: { token: plaintext } };
}

/** Revoke (soft) — the token stops authenticating immediately. */
export async function revokeApiToken(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  await prisma.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
  revalidatePath("/admin/api-tokens");
  return { ok: true };
}
