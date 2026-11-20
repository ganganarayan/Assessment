import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import { isPlatformOwner } from "@/lib/auth/platform";
import { isTestRunFor } from "@/lib/funnel/test-link";

/**
 * May this ?preview=1 run ignore the retake lock?
 *
 * Yes for whoever OWNS the funnel: the platform owner, a super admin, any login of the
 * workspace the funnel belongs to, or anyone holding the funnel's signed test link.
 *
 * Fixed 20-11-2026: this used to accept only the platform owner's own email, so a
 * workspace admin previewing their own funnel (signed in on their own domain) was
 * locked out after one test run, which is the opposite of what preview is for.
 * A stranger adding ?preview=1 to a live link gets nothing: no login, no test cookie.
 */
export async function previewBypassesLock(assessment: { id: string; tenantId: string | null }): Promise<boolean> {
  const u = (await getCurrentUser()) as { email?: string | null; role?: string | null; tenantId?: string | null } | null;
  if (u) {
    if (isPlatformOwner(u.email) || u.role === "SUPER_ADMIN") return true;
    if (u.tenantId && assessment.tenantId && u.tenantId === assessment.tenantId) return true;
  }
  return isTestRunFor(assessment.id);
}
