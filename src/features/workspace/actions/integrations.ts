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
 * these — it keeps using env — so nothing here can affect the live Gita funnel.
 *
 * The runtime FIRE wiring is LIVE: the funnel loads this tenant's pixel, CAPI fires
 * with this tenant's token, and Razorpay must be pointed at this tenant's own webhook
 * URL (below) so its captures are HMAC-verified with this tenant's webhook secret.
 */

export interface IntegrationSettingsView {
  metaPixelId: string;
  hasCapiToken: boolean;
  razorpayKeyId: string;
  hasRazorpaySecret: boolean;
  hasRazorpayWebhookSecret: boolean;
  /** Where THIS tenant must point Razorpay → Settings → Webhooks. */
  webhookUrl: string;
}

export async function getIntegrationSettings(): Promise<IntegrationSettingsView> {
  const { tenantId } = await requireWorkspace();
  const [s, tenant, domain] = await Promise.all([
    prisma.appSetting.findUnique({ where: { tenantId } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
    // The tenant's OWN domain, preferring a verified one. Razorpay must be pointed
    // at the host the tenant actually operates on — handing them the platform's
    // domain looks wrong and ties their payment config to someone else's hostname.
    prisma.domain.findFirst({
      where: { tenantId },
      orderBy: [{ verified: "desc" }, { createdAt: "asc" }],
      select: { hostname: true },
    }),
  ]);
  const base = domain?.hostname ? `https://${domain.hostname}` : env.NEXT_PUBLIC_APP_URL;
  return {
    metaPixelId: s?.metaPixelId ?? "",
    hasCapiToken: !!s?.metaCapiTokenEnc,
    razorpayKeyId: s?.razorpayKeyId ?? "",
    hasRazorpaySecret: !!s?.razorpayKeySecretEnc,
    hasRazorpayWebhookSecret: !!s?.razorpayWebhookSecretEnc,
    webhookUrl: `${base}/api/payments/razorpay/${tenant?.slug ?? ""}`,
  };
}

export async function updateMetaSettings(pixelId: string, capiToken: string): Promise<ActionResult> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;
  const data = {
    metaPixelId: pixelId.trim() || null,
    // Blank = keep the existing token (never round-trips the secret to the client).
    ...(capiToken.trim() ? { metaCapiTokenEnc: encryptWithSecret(capiToken.trim(), env.BETTER_AUTH_SECRET) } : {}),
  };
  await prisma.appSetting.upsert({ where: { tenantId }, update: data, create: { id: tenantAppSettingId(tenantId), tenantId, ...data } });
  revalidatePath("/w/settings");
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
