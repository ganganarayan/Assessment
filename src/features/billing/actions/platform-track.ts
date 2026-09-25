"use server";

import { resolvePlatformMetaConfig } from "@/lib/settings/config";
import { firePlatformRegistration } from "@/lib/billing/platform-events";

/**
 * Fire the SaaS-funnel CompleteRegistration on the platform pixel (server CAPI) right
 * after a free sign-up, and return the eventId + pixelId so the browser can fire the
 * matching pixel event (deduped by eventId). Safe to call unauthenticated — it only
 * reports a registration that just happened; inert when the pixel is unconfigured.
 */
export async function trackSaasRegistration(email: string): Promise<{ eventId: string; pixelId: string | null }> {
  const eventId = await firePlatformRegistration({ email: email?.trim() || null });
  const { pixelId } = await resolvePlatformMetaConfig();
  return { eventId, pixelId };
}
