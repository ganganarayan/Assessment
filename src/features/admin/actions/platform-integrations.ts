"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin, editDenied } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { encryptWithSecret } from "@/lib/crypto";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { type IntegrationSettingsView } from "@/features/workspace/actions/integrations";

/**
 * PLATFORM (Gita / singleton) integration config — the super-admin editor for the
 * keys that used to live ONLY in env. Writes the `id="singleton"` AppSetting row,
 * which `resolveMetaConfig(null)` / `resolveRazorpayConfig(null)` read FIRST, with
 * env as the fallback — so setting them here moves the platform off env without a
 * redeploy, and leaving them blank keeps the existing env behaviour.
 *
 * Distinct from the per-tenant editor (features/workspace/actions/integrations.ts):
 * this one targets the singleton, never a tenant row.
 */

export async function getPlatformIntegrationSettings(): Promise<IntegrationSettingsView> {
  await requireSuperAdmin();
  const s = await prisma.appSetting.findUnique({ where: { id: "singleton" } });
  return {
    metaPixelId: s?.metaPixelId ?? "",
    hasCapiToken: !!s?.metaCapiTokenEnc,
    razorpayKeyId: s?.razorpayKeyId ?? "",
    hasRazorpaySecret: !!s?.razorpayKeySecretEnc,
    hasRazorpayWebhookSecret: !!s?.razorpayWebhookSecretEnc,
    // The platform/Gita webhook is the un-suffixed route.
    webhookUrl: `${env.NEXT_PUBLIC_APP_URL}/api/payments/razorpay`,
  };
}

export async function updatePlatformMetaSettings(pixelId: string, capiToken: string): Promise<ActionResult> {
  const denied = editDenied(await requireSuperAdmin());
  if (denied) return denied;
  const data = {
    metaPixelId: pixelId.trim() || null,
    ...(capiToken.trim() ? { metaCapiTokenEnc: encryptWithSecret(capiToken.trim(), env.BETTER_AUTH_SECRET) } : {}),
  };
  await prisma.appSetting.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function getPasswordResetWebhook(): Promise<{ url: string }> {
  await requireSuperAdmin();
  const s = await prisma.appSetting.findUnique({ where: { id: "singleton" }, select: { passwordResetWebhookUrl: true } });
  return { url: s?.passwordResetWebhookUrl ?? "" };
}

/** The platform password-reset webhook: assess360 POSTs the reset link here; the CRM
 *  emails the user. Blank falls back to env PASSWORD_RESET_WEBHOOK_URL. */
export async function updatePasswordResetWebhook(url: string): Promise<ActionResult> {
  const denied = editDenied(await requireSuperAdmin());
  if (denied) return denied;
  const trimmed = url.trim();
  if (trimmed && !/^https?:\/\//i.test(trimmed)) return { ok: false, error: "Enter a full https:// URL." };
  await prisma.appSetting.upsert({
    where: { id: "singleton" },
    update: { passwordResetWebhookUrl: trimmed || null },
    create: { id: "singleton", passwordResetWebhookUrl: trimmed || null },
  });
  revalidatePath("/admin/settings");
  return { ok: true };
}

export interface LegalSettingsView {
  entityName: string;
  address: string;
  contactEmail: string;
  governingLocation: string;
}

/** Company/legal details shown ONLY on the public policy pages. Singleton row. */
export async function getLegalSettings(): Promise<LegalSettingsView> {
  await requireSuperAdmin();
  const s = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: {
      legalEntityName: true,
      legalAddress: true,
      legalContactEmail: true,
      legalGoverningLocation: true,
    },
  });
  return {
    entityName: s?.legalEntityName ?? "",
    address: s?.legalAddress ?? "",
    contactEmail: s?.legalContactEmail ?? "",
    governingLocation: s?.legalGoverningLocation ?? "",
  };
}

export async function updateLegalSettings(input: LegalSettingsView): Promise<ActionResult> {
  const denied = editDenied(await requireSuperAdmin());
  if (denied) return denied;
  const email = input.contactEmail.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid contact email." };
  }
  const data = {
    legalEntityName: input.entityName.trim() || null,
    legalAddress: input.address.trim() || null,
    legalContactEmail: email || null,
    legalGoverningLocation: input.governingLocation.trim() || null,
  };
  await prisma.appSetting.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  revalidatePath("/admin/settings");
  revalidatePath("/privacy");
  revalidatePath("/terms");
  revalidatePath("/refund");
  revalidatePath("/shipping");
  revalidatePath("/contact");
  return { ok: true };
}

export async function updatePlatformRazorpaySettings(
  keyId: string,
  keySecret: string,
  webhookSecret: string,
): Promise<ActionResult> {
  const denied = editDenied(await requireSuperAdmin());
  if (denied) return denied;
  const data = {
    razorpayKeyId: keyId.trim() || null,
    ...(keySecret.trim() ? { razorpayKeySecretEnc: encryptWithSecret(keySecret.trim(), env.BETTER_AUTH_SECRET) } : {}),
    ...(webhookSecret.trim()
      ? { razorpayWebhookSecretEnc: encryptWithSecret(webhookSecret.trim(), env.BETTER_AUTH_SECRET) }
      : {}),
  };
  await prisma.appSetting.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  revalidatePath("/admin/settings");
  return { ok: true };
}
