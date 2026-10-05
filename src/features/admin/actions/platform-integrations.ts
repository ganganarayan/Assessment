"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin, editDenied } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { encryptWithSecret } from "@/lib/crypto";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { type IntegrationSettingsView } from "@/features/workspace/actions/integrations";

/**
 * PLATFORM (Gita / singleton) integration config - the super-admin editor for the
 * keys that used to live ONLY in env. Writes the `id="singleton"` AppSetting row,
 * which `resolveMetaConfig(null)` / `resolveRazorpayConfig(null)` read FIRST, with
 * env as the fallback - so setting them here moves the platform off env without a
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
    // The platform scope has no tenant slug to route a return to, and its own funnels
    // use Razorpay directly, so there is nothing to paste anywhere. Blank, and the
    // field renders as the empty box it is rather than a broken-looking URL.
    paymentReturnUrl: "",
    heatmapCode: s?.heatmapCode ?? "",
    vidapulseTrackingEnabled: s?.vidapulseTrackingEnabled ?? true,
    vidapulseParam: s?.vidapulseParam ?? "cid",
  };
}

/** Save the platform/Gita VidaPulse embed-tracking config (singleton row). */
export async function updatePlatformVidapulseSettings(param: string, enabled: boolean): Promise<ActionResult> {
  const denied = editDenied(await requireSuperAdmin());
  if (denied) return denied;
  const data = { vidapulseTrackingEnabled: enabled, vidapulseParam: param.trim() || "cid" };
  await prisma.appSetting.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  revalidatePath("/admin/settings");
  return { ok: true };
}

/** Save (or clear) the platform/Gita heatmap-recording snippet (singleton row). */
export async function updatePlatformHeatmapSettings(code: string): Promise<ActionResult> {
  const denied = editDenied(await requireSuperAdmin());
  if (denied) return denied;
  const data = { heatmapCode: code.trim() || null };
  await prisma.appSetting.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  revalidatePath("/admin/settings");
  return { ok: true };
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

export interface PlatformPixelView {
  pixelId: string;
  hasCapiToken: boolean;
}

/** The Assess360 SaaS-funnel pixel (landing / signup / subscription) - SEPARATE from
 *  the Gita assessment pixel above. Singleton row; token never returned. */
export async function getPlatformSubscriptionPixel(): Promise<PlatformPixelView> {
  await requireSuperAdmin();
  const s = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: { platformPixelId: true, platformCapiTokenEnc: true },
  });
  return { pixelId: s?.platformPixelId ?? "", hasCapiToken: !!s?.platformCapiTokenEnc };
}

/** Save the Assess360 SaaS-funnel pixel + CAPI token (singleton row). A blank token
 *  is left unchanged (so re-saving the pixel id alone never wipes the stored token);
 *  the token is encrypted at rest and never shown again. */
export async function updatePlatformSubscriptionPixel(pixelId: string, capiToken: string): Promise<ActionResult> {
  const denied = editDenied(await requireSuperAdmin());
  if (denied) return denied;
  const data = {
    platformPixelId: pixelId.trim() || null,
    ...(capiToken.trim() ? { platformCapiTokenEnc: encryptWithSecret(capiToken.trim(), env.BETTER_AUTH_SECRET) } : {}),
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
  /** GSTIN - a public tax identifier, so it is safe in public structured data. */
  gstin: string;
  /** ISO year-month, e.g. "2024-02". Month precision is all schema.org needs. */
  foundedOn: string;
}

/** 15-character GSTIN: state code, PAN, entity number, PAN check letter, Z, checksum. */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const YEAR_MONTH_RE = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

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
      legalGstin: true,
      legalFoundedOn: true,
    },
  });
  return {
    entityName: s?.legalEntityName ?? "",
    address: s?.legalAddress ?? "",
    contactEmail: s?.legalContactEmail ?? "",
    governingLocation: s?.legalGoverningLocation ?? "",
    gstin: s?.legalGstin ?? "",
    foundedOn: s?.legalFoundedOn ?? "",
  };
}

export async function updateLegalSettings(input: LegalSettingsView): Promise<ActionResult> {
  const denied = editDenied(await requireSuperAdmin());
  if (denied) return denied;
  const email = input.contactEmail.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid contact email." };
  }
  // GSTIN is uppercased before validating: it is printed uppercase everywhere, and
  // rejecting a correct number for its case would be a pointless obstacle.
  const gstin = input.gstin.trim().toUpperCase();
  if (gstin && !GSTIN_RE.test(gstin)) {
    return { ok: false, error: "GSTIN must be 15 characters, e.g. 22AAAAA0000A1Z5." };
  }
  const foundedOn = input.foundedOn.trim();
  if (foundedOn && !YEAR_MONTH_RE.test(foundedOn)) {
    return { ok: false, error: "Founded must be a year and month, e.g. 2024-02." };
  }
  const data = {
    legalEntityName: input.entityName.trim() || null,
    legalAddress: input.address.trim() || null,
    legalContactEmail: email || null,
    legalGoverningLocation: input.governingLocation.trim() || null,
    legalGstin: gstin || null,
    legalFoundedOn: foundedOn || null,
  };
  await prisma.appSetting.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  revalidatePath("/admin/settings");
  // The landing page's JSON-LD Organization reads the same row.
  revalidatePath("/");
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

/**
 * The PLATFORM MASTER SWITCH for respondent payments (singleton row).
 *
 * False stops every tenant funnel taking money, above each tenant's own switch and
 * above each assessment's paid mode. Nothing is deleted and no configuration is lost:
 * the funnels run free until it is turned back on.
 */
export async function setPlatformPayments(enabled: boolean): Promise<ActionResult> {
  const denied = editDenied(await requireSuperAdmin());
  if (denied) return denied;
  await prisma.appSetting.upsert({
    where: { id: "singleton" },
    update: { paymentsEnabledGlobal: enabled },
    create: { id: "singleton", paymentsEnabledGlobal: enabled },
  });
  revalidatePath("/admin/settings");
  revalidatePath("/platform");
  return { ok: true };
}

/** Current state of the master switch, for the settings screen. */
export async function getPlatformPayments(): Promise<boolean> {
  await requireSuperAdmin();
  const s = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: { paymentsEnabledGlobal: true },
  });
  return s?.paymentsEnabledGlobal !== false;
}
