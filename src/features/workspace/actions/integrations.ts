"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace, editDenied } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { encryptWithSecret } from "@/lib/crypto";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * Per-tenant integration config (Meta ads + Razorpay). Stored on the tenant's own
 * AppSetting row; secrets are encrypted at rest and NEVER returned to the client
 * (the form shows only "saved" + a masked hint). The platform/Gita path never uses
 * these — it keeps using env — so nothing here can affect the live Gita funnel.
 *
 * NOTE: this is the STORAGE layer. The runtime FIRE wiring (funnel loads the tenant
 * pixel; CAPI fires with the tenant token; Razorpay webhook routes per tenant) is a
 * separate, live-fire-tested step and is not yet connected.
 */

export interface IntegrationSettingsView {
  metaPixelId: string;
  hasCapiToken: boolean;
  razorpayKeyId: string;
  hasRazorpaySecret: boolean;
  hasRazorpayWebhookSecret: boolean;
}

export async function getIntegrationSettings(): Promise<IntegrationSettingsView> {
  const { tenantId } = await requireWorkspace();
  const s = await prisma.appSetting.findUnique({ where: { tenantId } });
  return {
    metaPixelId: s?.metaPixelId ?? "",
    hasCapiToken: !!s?.metaCapiTokenEnc,
    razorpayKeyId: s?.razorpayKeyId ?? "",
    hasRazorpaySecret: !!s?.razorpayKeySecretEnc,
    hasRazorpayWebhookSecret: !!s?.razorpayWebhookSecretEnc,
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
  await prisma.appSetting.upsert({ where: { tenantId }, update: data, create: { tenantId, ...data } });
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
  await prisma.appSetting.upsert({ where: { tenantId }, update: data, create: { tenantId, ...data } });
  revalidatePath("/w/settings");
  return { ok: true };
}
