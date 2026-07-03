import "server-only";
import { prisma } from "@/lib/db/prisma";
import { hashApiToken } from "@/lib/api-auth/token";

/**
 * Shared authenticator for the scoped external API layer. Every external data
 * endpoint calls this with its REQUIRED scope, so a key only ever unlocks its
 * own data domain (least privilege). Returns the token's tenant scope
 * (null = platform-owned) plus id/scope, or null when the header is missing,
 * the token is unknown/revoked, or its scope does not match.
 */
export interface ApiAuth {
  tokenId: string;
  scope: string;
  tenantId: string | null;
}

export async function authenticateApiToken(
  req: Request,
  requiredScope: string,
): Promise<ApiAuth | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const presented = match[1]?.trim();
  if (!presented) return null;

  const tok = await prisma.apiToken.findUnique({
    where: { tokenHash: hashApiToken(presented) },
    select: { id: true, scope: true, tenantId: true, revokedAt: true },
  });
  if (!tok || tok.revokedAt || tok.scope !== requiredScope) return null;

  // Best-effort usage stamp; never blocks or fails the request.
  void prisma.apiToken.update({ where: { id: tok.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return { tokenId: tok.id, scope: tok.scope, tenantId: tok.tenantId };
}
