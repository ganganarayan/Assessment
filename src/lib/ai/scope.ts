import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isPlatformScope } from "@/lib/tenant/platform-tenant";

/**
 * May this scope SEE the built-in system prompt versions?
 *
 * The built-ins (Bridge, V2, V1 in lib/ai/prompt-versions.ts) are the platform
 * owner's own work, and "View assembled system prompt" prints them in full. Listing
 * them inside a customer's workspace hands every tenant the mechanism the product is
 * sold on. So they belong to the platform and to the owner's OWN businesses, and to
 * nobody else.
 *
 * `unlimited` is the existing flag for "a tenant the owner runs themselves rather
 * than sells to" (see Tenant.unlimited), which is exactly the population that should
 * keep them: the owner's funnel businesses are separate tenants, not the platform.
 *
 * This gates LISTING, PREVIEW and RESOLUTION alike: a tenant must not generate with
 * instructions it cannot read, and a workspace that never picked a version must not
 * quietly inherit the owner's default. `resolvePromptVersion` returns null instead,
 * and the result renders with no AI message - the same fail-soft path as an
 * unconfigured provider. Verified safe on 2026-10-05: the only non-platform tenants
 * are Apply Gita and Cosmetic Divine Leads, both flagged unlimited, so no live funnel
 * loses its statement.
 */
export async function builtInPromptsAllowed(tenantId: string | null): Promise<boolean> {
  if (isPlatformScope(tenantId)) return true;
  try {
    const t = await prisma.tenant.findUnique({
      where: { id: tenantId as string },
      select: { unlimited: true },
    });
    return t?.unlimited === true;
  } catch {
    // Fail CLOSED: a DB blip must not expose the prompts.
    return false;
  }
}
