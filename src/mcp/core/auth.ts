import "server-only";
import { prisma } from "@/lib/db/prisma";
import { hashApiToken } from "@/lib/api-auth/token";
import { isSuperAdmin } from "@/lib/auth/guards";
import { resolvePlan } from "@/lib/billing/plan-resolve";
import { isAgencyTenantOf } from "@/lib/tenant/agency";
import { PLATFORM_TENANT_ID, isPlatformTenant } from "@/lib/tenant/platform-tenant";
import { tenantOnly } from "@/lib/tenant/scope";
import type { McpActor } from "@/lib/auth/mcp-actor";
import { mcpWorkspaceEligibility } from "@/mcp/core/eligibility";
import { isMcpScope, ToolError, type McpIdentity, type McpWorkspace } from "@/mcp/core/types";

/**
 * Bearer token to identity, then identity plus an optional workspace_id to the workspace one
 * call operates on.
 *
 * Reach, by the owner's rule (14-11-2026):
 *  - a workspace key: its own workspace, nothing else
 *  - an agency key: the agency's own workspace and its client workspaces
 *  - the owner's key: every workspace on the platform, like the super-admin console
 *
 * 🔴 The workspace is never taken on trust. An agency client is re-checked against the
 * parent link here AND again by enteredAgencyTenant() inside every action, and an id outside
 * the key's reach is refused with the same sentence whether or not it exists, so a key
 * cannot probe for other workspaces.
 */

export type AuthOutcome = { ok: true; identity: McpIdentity } | { ok: false; status: number; error: string };

const REFUSED = "This MCP key is not valid. Mint a new one under API tokens.";

export async function authenticateMcp(req: Request): Promise<AuthOutcome> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const presented = match?.[1]?.trim();
  if (!presented) return { ok: false, status: 401, error: "Send the MCP key as Authorization: Bearer <key>." };

  const tok = await prisma.apiToken.findUnique({
    where: { tokenHash: hashApiToken(presented) },
    select: { id: true, prefix: true, label: true, scope: true, tenantId: true, revokedAt: true, createdById: true },
  });
  if (!tok || tok.revokedAt || !isMcpScope(tok.scope) || !tok.tenantId || !tok.createdById) {
    return { ok: false, status: 401, error: REFUSED };
  }

  const user = await prisma.user.findUnique({
    where: { id: tok.createdById },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      role: true,
      tenantId: true,
      staffPermission: true,
      mustChangePassword: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user || user.deletedAt) return { ok: false, status: 401, error: REFUSED };

  const isOwner = isSuperAdmin({ role: user.role, email: user.email });
  if (isOwner) {
    // The owner's key lives on the Platform workspace. A key the owner minted while inside a
    // customer workspace is still the owner's key (minting stamps platform for them).
    if (!isPlatformTenant(tok.tenantId)) return { ok: false, status: 401, error: REFUSED };
  } else {
    // The login must still own the workspace the key was minted in: a user moved or demoted
    // to staff since minting loses the key, without anybody remembering to revoke it.
    if (user.tenantId !== tok.tenantId || user.staffPermission !== null) {
      return { ok: false, status: 401, error: REFUSED };
    }
    const allowed = await mcpWorkspaceEligibility(tok.tenantId);
    if (!allowed.ok) return { ok: false, status: 403, error: allowed.reason };
  }

  void prisma.apiToken.update({ where: { id: tok.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  const plan = isOwner ? null : await resolvePlan(tok.tenantId);
  return {
    ok: true,
    identity: {
      tokenId: tok.id,
      tokenPrefix: tok.prefix,
      tokenLabel: tok.label,
      scope: tok.scope,
      homeTenantId: tok.tenantId,
      isOwner,
      isAgency: !isOwner && (plan?.limits.agencyTenants ?? 0) > 0,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        role: user.role,
        tenantId: user.tenantId,
        staffPermission: user.staffPermission,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    },
  };
}

const OUT_OF_REACH = "That workspace is not reachable with this key.";

/**
 * The workspace for one call, plus the actor the app's own guards will see.
 * workspace_id omitted = the key's home workspace.
 */
export async function resolveCallWorkspace(
  identity: McpIdentity,
  workspaceId: string | undefined,
): Promise<{ workspace: McpWorkspace; actor: McpActor }> {
  const target = workspaceId?.trim() || identity.homeTenantId;

  if (target !== identity.homeTenantId) {
    if (identity.isOwner) {
      // any live workspace
    } else if (!identity.isAgency || !(await isAgencyTenantOf(target, identity.homeTenantId))) {
      throw new ToolError(OUT_OF_REACH);
    }
  }

  const found = await prisma.tenant.findFirst({
    where: { id: target, deletedAt: null },
    select: { id: true, name: true, slug: true },
  });
  // The Platform workspace is data with a known id; on a database where its row was never
  // created the owner's home view still exists, exactly as it does in the console.
  const row = found ?? (isPlatformTenant(target) ? { id: PLATFORM_TENANT_ID, name: "Platform", slug: "platform" } : null);
  if (!row) throw new ToolError(OUT_OF_REACH);

  // What readActingTenant() answers inside this call: the entered workspace, or null for the
  // key's own home view (the owner's home is the platform console, null on the cookie too).
  const home = target === identity.homeTenantId || (identity.isOwner && target === PLATFORM_TENANT_ID);
  const actor: McpActor = {
    tokenId: identity.tokenId,
    user: identity.user,
    actingTenantId: home ? null : target,
  };
  return { workspace: { id: row.id, name: row.name, slug: row.slug, scope: tenantOnly(row.id) }, actor };
}
