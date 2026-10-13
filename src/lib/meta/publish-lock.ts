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
 *
 * 🔴 PER ASSESSMENT, not per tenant. This check used to resolve the tenant's default ad
 * account whatever funnel was being published, so a funnel pointed at a SECOND ad
 * account published cleanly on the strength of the first one's credentials and then
 * reported nothing - the precise silent failure described above, reintroduced by the
 * feature that made multiple accounts possible. `adAccountId` is therefore required:
 * callers pass the assessment's own value, and null still means "the tenant's default".
 */
export async function metaPublishBlock(tenantId: string, adAccountId: string | null): Promise<string | null> {
  const [setting, meta] = await Promise.all([
    prisma.appSetting.findUnique({
      where: appSettingWhere(tenantId) as never,
      select: { metaNotUsed: true },
    }),
    resolveMetaConfig(tenantId, adAccountId),
  ]);

  if ((setting as { metaNotUsed?: boolean } | null)?.metaNotUsed === true) return null;

  const missing: string[] = [];
  if (!meta.pixelId) missing.push("your Meta pixel ID");
  if (!meta.capiToken) missing.push("your Meta CAPI access token");
  if (missing.length === 0) return null;

  const what = missing.length === 2 ? `${missing[0]} and ${missing[1]}` : missing[0];
  // Name the account when the funnel picked one: on a workspace with several, "add it in
  // Settings" is the wrong instruction and the right screen is the one holding THAT
  // account's credentials.
  const where = adAccountId
    ? "Add it to the ad account this funnel reports to (Ad accounts)"
    : "Add it to your default ad account (Ad accounts)";
  return `You can't publish yet: ${what} ${missing.length === 2 ? "are" : "is"} missing. Without it this funnel will collect leads and report nothing to your ad account. ${where}, or tick "We don't use Meta" in Settings if you are not running Meta ads.`;
}
