import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolvePlan } from "@/lib/billing/plan-resolve";
import { featureAllowedFor } from "@/lib/features/release";
import { isPlatformTenant } from "@/lib/tenant/platform-tenant";

/**
 * May this workspace hold (and use) an MCP key?
 *
 * The owner's rule (14-11-2026): every PAID plan, limited by its own plan limits, which the
 * existing actions already enforce. So:
 *  - the platform and internal (unlimited) workspaces: yes
 *  - trialing or parked: no, a key is for paying customers
 *  - a client workspace under an agency: no, its agency's one key reaches it instead
 *  - and the "mcp" release switch must be on (the platform and internal workspaces are
 *    exempt, so the owner can prove it first)
 *
 * One function, called by minting, by the API tokens page and nav, and by every MCP request,
 * so a workspace that stops paying loses the connection on its next call.
 */
export type McpEligibility = { ok: true } | { ok: false; reason: string };

export async function mcpWorkspaceEligibility(tenantId: string): Promise<McpEligibility> {
  if (isPlatformTenant(tenantId)) return { ok: true };
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { deletedAt: true, status: true, agencyAdminTenantId: true, unlimited: true },
  });
  if (!tenant || tenant.deletedAt) return { ok: false, reason: "This workspace no longer exists." };
  if (tenant.status === "SUSPENDED") return { ok: false, reason: "This workspace is suspended." };
  if (!(await featureAllowedFor("mcp", tenantId))) return { ok: false, reason: "That is not available in your workspace." };
  if (tenant.unlimited) return { ok: true };
  if (tenant.agencyAdminTenantId) {
    return { ok: false, reason: "A client workspace is reached through its agency's key, not one of its own." };
  }
  const plan = await resolvePlan(tenantId);
  if (plan.isPlatform || plan.unlimited) return { ok: true };
  if (plan.parked) return { ok: false, reason: "This workspace is paused. Pick a plan to reconnect Claude." };
  if (plan.trialing) return { ok: false, reason: "Connecting Claude is part of every paid plan. It unlocks when your trial becomes a plan." };
  return { ok: true };
}
