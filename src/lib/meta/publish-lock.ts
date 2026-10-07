import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolveMetaConfig } from "@/lib/settings/config";
import { appSettingWhere } from "@/lib/settings/tenant-row";

/**
 * May this workspace PUBLISH a funnel?
 *
 * The rule: a Meta pixel id AND a CAPI access token, or the tenant has ticked "we
 * don't use Meta" in their pixel settings.
 *
 * WHY A LOCK AT ALL. A funnel published with neither collects leads perfectly and tells
 * the ad account nothing. Nobody sees an error. What the tenant sees is money going out
 * and Ads Manager reporting no results, and the conclusion they draw is that the product
 * does not work - which is the most expensive possible way to find out that a field was
 * left blank. The lock turns a silent failure into a sentence.
 *
 * WHY AN OVERRIDE. "No pixel" has two meanings. "We do not advertise on Meta" is a
 * legitimate way to run this product; "we have not set it up yet" is the mistake. No
 * amount of inspecting the data distinguishes them, so the tenant says which it is, once.
 *
 * PUBLISH ONLY. Never unpublish - a tenant taking their own funnel down is not something
 * to stand in the way of - which mirrors the parked-tenant rule exactly.
 *
 * Returns null when publishing is allowed, or the sentence to show when it is not. The
 * sentence names the missing field, because "configure Meta" sends somebody hunting
 * through a settings page they have already looked at.
 */
export async function metaPublishBlock(tenantId: string): Promise<string | null> {
  const [setting, meta] = await Promise.all([
    prisma.appSetting.findUnique({
      where: appSettingWhere(tenantId) as never,
      select: { metaNotUsed: true },
    }),
    resolveMetaConfig(tenantId),
  ]);

  if ((setting as { metaNotUsed?: boolean } | null)?.metaNotUsed === true) return null;

  const missing: string[] = [];
  if (!meta.pixelId) missing.push("your Meta pixel ID");
  if (!meta.capiToken) missing.push("your Meta CAPI access token");
  if (missing.length === 0) return null;

  const what = missing.length === 2 ? `${missing[0]} and ${missing[1]}` : missing[0];
  return `You can't publish yet: ${what} ${missing.length === 2 ? "are" : "is"} missing. Without it this funnel will collect leads and report nothing to your ad account. Add it in Settings, or tick "We don't use Meta" there if you are not running Meta ads.`;
}
