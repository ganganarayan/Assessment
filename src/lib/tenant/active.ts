import { prisma } from "@/lib/db/prisma";
import { resolvePlan } from "@/lib/billing/plan-resolve";
import { isBusinessTenant } from "@/lib/tenant/platform-tenant";

/**
 * May this tenant OPERATE right now: send, save, serve? The one answer every queue and
 * every save asks (Phase 2 of the multi-tenant review).
 *
 * 🔴 WHY ONE PLACE. "Parked" used to be a screen lock and nothing else. A parked,
 * cancelled or deleted workspace kept sending its broadcasts, automations, workflow
 * steps and webhook retries, because each runner only checked whether its own feature
 * was switched on. Four runners each deciding for themselves is four chances to forget,
 * so they all ask this instead.
 *
 * The states, in the order they are decided:
 *  - "missing"   no such tenant row (purged mid-run).
 *  - "deleted"   soft-deleted from the platform console.
 *  - "suspended" the owner's brake (Tenant.status = SUSPENDED).
 *  - "parked"    trial over or plan lapsed, no subscription, grant or Unlimited flag.
 *  - "active"    everything else, and always the platform itself.
 *
 * Read by background runners in a loop, so the answer is cached for a short while per
 * process. 30 seconds is short enough that a tenant who pays is sending again before
 * they have finished reading the confirmation, and long enough that a broadcast to
 * 5,000 contacts costs one lookup rather than 5,000.
 */
export type TenantState = "active" | "parked" | "suspended" | "deleted" | "missing";

const TTL_MS = 30_000;
const cache = new Map<string, { state: TenantState; at: number }>();

export async function tenantState(tenantId: string | null | undefined): Promise<TenantState> {
  if (!isBusinessTenant(tenantId)) return "active";
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.state;
  const state = await readState(tenantId);
  cache.set(tenantId, { state, at: Date.now() });
  return state;
}

async function readState(tenantId: string): Promise<TenantState> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { deletedAt: true, status: true },
  });
  if (!t) return "missing";
  if (t.deletedAt) return "deleted";
  if (t.status === "SUSPENDED") return "suspended";
  return (await resolvePlan(tenantId)).parked ? "parked" : "active";
}

/** True when the tenant may send, save and serve. Platform scope always may. */
export async function tenantMayOperate(tenantId: string | null | undefined): Promise<boolean> {
  return (await tenantState(tenantId)) === "active";
}

/** Drop the cached answer, after a write that changes it (suspend, pay, grant). */
export function forgetTenantActive(tenantId: string | null | undefined): void {
  if (tenantId) cache.delete(tenantId);
}

/**
 * The sentence a refused save shows, by state. A parked account is told how to end it;
 * the others are told who to ask, because they cannot end it themselves.
 */
export function writeRefusal(state: TenantState): string {
  switch (state) {
    case "parked":
      return "This workspace is paused until a plan is picked. Open Billing to turn it back on.";
    case "suspended":
      return "This workspace is suspended. Contact support to have it reinstated.";
    default:
      return "This workspace is no longer active.";
  }
}
