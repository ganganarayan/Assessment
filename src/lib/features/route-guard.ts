import "server-only";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/guards";
import { featureAllowedFor } from "@/lib/features/release";
import { type FeatureReleaseKey } from "@/lib/features/catalog";

/**
 * Route guard for a feature that may be held back from customers.
 *
 * Guarded on the ROUTE and not only hidden in the nav, the same rule the API tokens
 * page follows: a hidden link is presentation, never a permission, and a customer who
 * has the URL from a changelog, a support thread or their own history must not land in
 * a half-released feature.
 *
 * A redirect rather than a "not on your plan" panel, because there is nothing to sell:
 * the feature is not withheld from them, it does not exist for anybody yet. A page
 * explaining a feature nobody can buy is an advertisement for a complaint.
 *
 * A super admin who has ENTERED the workspace is never gated - they are operating it,
 * not using it, and they are the one person who needs to see the thing before it ships.
 */
export async function requireReleasedFeature(key: FeatureReleaseKey): Promise<void> {
  const { tenantId, impersonating } = await requireWorkspace();
  if (impersonating) return;
  if (!(await featureAllowedFor(key, tenantId))) redirect("/w/dashboard");
}
