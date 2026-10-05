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
 * 🟡 This gates LISTING and PREVIEW only, deliberately. `resolvePromptVersion` still
 * resolves a built-in id for anyone, because a live funnel that was already pointed
 * at one must keep generating - silently dropping its statement mid-campaign would be
 * a worse failure than a tenant keeping a prompt they can no longer read. A tenant
 * cannot see the text and cannot newly select one, which is what the leak was.
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
