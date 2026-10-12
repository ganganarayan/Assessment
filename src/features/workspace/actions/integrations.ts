"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace, editDenied } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { encryptWithSecret } from "@/lib/crypto";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { tenantAppSettingId } from "@/lib/settings/tenant-row";

/**
 * Per-tenant integration config (Meta ads + Razorpay). Stored on the tenant's own
 * AppSetting row; secrets are encrypted at rest and NEVER returned to the client
 * (the form shows only "saved" + a masked hint). The platform/Gita path never uses
 * these - it keeps using env - so nothing here can affect the live Gita funnel.
 *
 * The runtime FIRE wiring is LIVE: the funnel loads this tenant's pixel, CAPI fires
 * with this tenant's token, and Razorpay must be pointed at this tenant's own webhook
 * URL (below) so its captures are HMAC-verified with this tenant's webhook secret.
 */

export interface IntegrationSettingsView {
  metaPixelId: string;
  hasCapiToken: boolean;
  /**
   * How many ad accounts this workspace has. The Meta fields on this screen edit the
   * DEFAULT one; with more than one configured the screen says so and sends people to
   * the Ad accounts screen rather than pretending there is a single pixel.
   */
  adAccountCount: number;
  /** The default account's name, so the fields say which account they are editing. */
  defaultAdAccountLabel: string | null;
  /** "We don't use Meta" - the tenant's opt-out of the publish lock. */
  metaNotUsed: boolean;
  razorpayKeyId: string;
  hasRazorpaySecret: boolean;
  hasRazorpayWebhookSecret: boolean;
  /** Where THIS tenant must point Razorpay → Settings → Webhooks. */
  webhookUrl: string;
  /** Where THIS tenant points an EXTERNAL gateway's success redirect. One string for
   *  every respondent; the browser is matched on arrival. See api/pay/return. */
  paymentReturnUrl: string;
  /** Heatmap/recording snippet (e.g. MS Clarity), shown as-is so it can be edited. */
  heatmapCode: string;
  /** VidaPulse identity bridge: pass the opaque customerId into the VSL embed. */
  vidapulseTrackingEnabled: boolean;
  vidapulseParam: string;
}

export async function getIntegrationSettings(): Promise<IntegrationSettingsView> {
  const { tenantId } = await requireWorkspace();
  const [s, tenant, domain, defaultAccount, adAccountCount] = await Promise.all([
    prisma.appSetting.findUnique({ where: { tenantId } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
    // The tenant's OWN domain, preferring a verified one. Razorpay must be pointed
    // at the host the tenant actually operates on - handing them the platform's
    // domain looks wrong and ties their payment config to someone else's hostname.
    prisma.domain.findFirst({
      where: { tenantId },
      orderBy: [{ verified: "desc" }, { createdAt: "asc" }],
      select: { hostname: true },
    }),
    // 🔴 READ FROM THE SAME PLACE THE FUNNEL READS. The pixel moved into AdAccount when
    // the model landed, and this screen kept reading the AppSetting columns - so a
    // tenant whose row had been backfilled saw the value the resolver had stopped using.
    prisma.adAccount.findFirst({
      where: { tenantId, isDefault: true },
      select: { label: true, pixelId: true, capiTokenEnc: true },
    }),
    prisma.adAccount.count({ where: { tenantId } }),
  ]);
  const base = domain?.hostname ? `https://${domain.hostname}` : env.NEXT_PUBLIC_APP_URL;
  return {
    // The default ad account is the source of truth; the legacy columns are read only
    // for a tenant that has no ad-account rows at all, which is exactly when the
    // resolver reads them too.
    metaPixelId: defaultAccount ? (defaultAccount.pixelId ?? "") : (s?.metaPixelId ?? ""),
    hasCapiToken: defaultAccount ? !!defaultAccount.capiTokenEnc : !!s?.metaCapiTokenEnc,
    adAccountCount,
    defaultAdAccountLabel: defaultAccount?.label ?? null,
    metaNotUsed: s?.metaNotUsed ?? false,
    razorpayKeyId: s?.razorpayKeyId ?? "",
    hasRazorpaySecret: !!s?.razorpayKeySecretEnc,
    hasRazorpayWebhookSecret: !!s?.razorpayWebhookSecretEnc,
    webhookUrl: `${base}/api/payments/razorpay/${tenant?.slug ?? ""}`,
    paymentReturnUrl: `${base}/api/pay/return/${tenant?.slug ?? ""}`,
    heatmapCode: s?.heatmapCode ?? "",
    vidapulseTrackingEnabled: s?.vidapulseTrackingEnabled ?? true,
    vidapulseParam: s?.vidapulseParam ?? "cid",
  };
}

/** Save this tenant's VidaPulse embed-tracking config (param name + on/off). */
export async function updateVidapulseSettings(param: string, enabled: boolean): Promise<ActionResult> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;
  const data = { vidapulseTrackingEnabled: enabled, vidapulseParam: param.trim() || "cid" };
  await prisma.appSetting.upsert({ where: { tenantId }, update: data, create: { id: tenantAppSettingId(tenantId), tenantId, ...data } });
  revalidatePath("/w/settings");
  return { ok: true };
}

/** Save (or clear) this tenant's heatmap/recording snippet. Stored verbatim. */
export async function updateHeatmapSettings(code: string): Promise<ActionResult> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;
  const data = { heatmapCode: code.trim() || null };
  await prisma.appSetting.upsert({ where: { tenantId }, update: data, create: { id: tenantAppSettingId(tenantId), tenantId, ...data } });
  revalidatePath("/w/settings");
  return { ok: true };
}

/**
 * Save this workspace's Meta pixel + CAPI token - which now means saving them ON THE
 * DEFAULT AD ACCOUNT.
 *
 * 🔴 THE BUG THIS FIXES WAS LIVE AND SILENT. The ad-account migration backfilled one row
 * per tenant from these AppSetting columns and `resolveMetaConfig` began preferring the
 * row. This action kept writing the columns. So for every backfilled tenant, saving a
 * pixel here updated a value nothing reads: the form said saved, the funnel kept firing
 * the old pixel, and no error appeared anywhere. A tenant fixing a wrong pixel id would
 * have had no way to tell it had not taken.
 *
 * NOT METERED, deliberately. This creates a row only when a tenant has none, which moves
 * their existing single pixel into the model rather than adding capacity - and metering
 * it would stop a Gate tenant (one ad account) from saving the one pixel they already
 * had. New accounts beyond the first go through createAdAccount, which is metered.
 *
 * The legacy columns are CLEARED as the row is written, so there is one source of truth
 * from the first save onwards and no stale value waiting behind the fallback.
 */
export async function updateMetaSettings(pixelId: string, capiToken: string): Promise<ActionResult> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;

  const pixel = pixelId.trim() || null;
  const tokenEnc = capiToken.trim() ? encryptWithSecret(capiToken.trim(), env.BETTER_AUTH_SECRET) : null;

  const existing = await prisma.adAccount.findFirst({
    where: { tenantId, isDefault: true },
    select: { id: true },
  });

  if (existing) {
    await prisma.adAccount.update({
      where: { id: existing.id },
      data: { pixelId: pixel, ...(tokenEnc ? { capiTokenEnc: tokenEnc } : {}) },
    });
  } else {
    // No row yet: this tenant predates the model, or has never configured Meta. Name it
    // "Default" - the same label the migration's backfill used, so the two paths produce
    // one recognisable thing rather than two conventions.
    await prisma.adAccount.create({
      data: { tenantId, label: "Default", pixelId: pixel, capiTokenEnc: tokenEnc, isDefault: true },
    });
  }

  // Retire the columns for this tenant now that a row owns the value.
  await prisma.appSetting.upsert({
    where: { tenantId },
    update: { metaPixelId: null, metaCapiTokenEnc: null },
    create: { id: tenantAppSettingId(tenantId), tenantId, metaPixelId: null, metaCapiTokenEnc: null },
  });

  revalidatePath("/w/settings");
  revalidatePath("/w/ad-accounts");
  // The publish lock reads this, so an assessment editor open in another tab has to
  // re-resolve rather than keep showing a block that no longer applies.
  revalidatePath("/w/assessments");
  return { ok: true };
}

/**
 * Save the "We don't use Meta" opt-out.
 *
 * Its own action, not a third argument to updateMetaSettings, because it answers a
 * different question. The pixel fields are "here are my credentials"; this is "I am not
 * going to give you any, and that is deliberate". Bolting it onto the credential save
 * would mean a tenant who only wanted to tick the box had to press "Save Meta settings",
 * which reads like saving two empty fields.
 *
 * Revalidates the assessments pages too: the publish lock is resolved on the server, so
 * ticking this has to make the Publish button on an open editor come back to life.
 */
export async function updateMetaNotUsed(notUsed: boolean): Promise<ActionResult> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;
  const data = { metaNotUsed: notUsed };
  await prisma.appSetting.upsert({ where: { tenantId }, update: data, create: { id: tenantAppSettingId(tenantId), tenantId, ...data } });
  revalidatePath("/w/settings");
  revalidatePath("/w/assessments");
  return { ok: true };
}

export async function updateRazorpaySettings(
  keyId: string,
  keySecret: string,
  webhookSecret: string,
): Promise<ActionResult> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;
  const data = {
    razorpayKeyId: keyId.trim() || null,
    ...(keySecret.trim() ? { razorpayKeySecretEnc: encryptWithSecret(keySecret.trim(), env.BETTER_AUTH_SECRET) } : {}),
    ...(webhookSecret.trim()
      ? { razorpayWebhookSecretEnc: encryptWithSecret(webhookSecret.trim(), env.BETTER_AUTH_SECRET) }
      : {}),
  };
  await prisma.appSetting.upsert({ where: { tenantId }, update: data, create: { id: tenantAppSettingId(tenantId), tenantId, ...data } });
  revalidatePath("/w/settings");
  return { ok: true };
}
