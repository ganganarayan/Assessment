"use server";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/guards";
import { resolvePlatformMetaConfig } from "@/lib/settings/config";
import { fireStartTrial } from "@/lib/billing/platform-events";

/**
 * Report StartTrial for this workspace, ONCE, and return the eventId + pixelId so the
 * browser can fire the matching pixel event (deduped by eventId).
 *
 * Called when someone first reaches the app after signing up. Guarded three ways:
 *
 *  - Per WORKSPACE, not per user. A second staff member arriving is not a second trial.
 *  - By a stored stamp, claimed with a compare-and-swap, so two tabs opening at once
 *    cannot both fire and concurrent requests cannot race.
 *  - By the stamp being set on the FIRST arrival only, so a returning owner opening the
 *    dashboard every morning reports nothing. Signing in is not starting a trial.
 *
 * Returns nulls when there is nothing to fire, which is the normal case on every visit
 * after the first; the browser then stays silent too.
 */
export async function trackStartTrial(): Promise<{ eventId: string | null; pixelId: string | null }> {
  const user = await requireUser();
  const tenantId = user.tenantId ?? null;
  if (!tenantId) return { eventId: null, pixelId: null };

  // Claim it before sending. A duplicate trial event is worse than a missed one: it
  // inflates the very number this whole change exists to make honest.
  const claim = await prisma.tenant.updateMany({
    where: { id: tenantId, startTrialFiredAt: null },
    data: { startTrialFiredAt: new Date() },
  });
  if (claim.count === 0) return { eventId: null, pixelId: null };

  const eventId = await fireStartTrial({ email: user.email ?? null });
  const { pixelId } = await resolvePlatformMetaConfig();
  return { eventId, pixelId };
}
