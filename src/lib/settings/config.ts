import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { decryptWithSecret } from "@/lib/crypto";

/**
 * Per-tenant integration config (Meta pixel/CAPI, Razorpay), resolved from the
 * AppSetting row — NOT env. A tenant reads its OWN row and never falls back. The
 * platform/Gita tenant (tenantId null / singleton) falls back to env when a value
 * isn't set in Settings yet, so the live Gita funnel keeps firing during migration.
 * Once Gita's values are entered in super-admin Settings, the env vars can be removed.
 */

const SEL_META = { metaPixelId: true, metaCapiTokenEnc: true } as const;
const SEL_RZP = { razorpayKeyId: true, razorpayKeySecretEnc: true, razorpayWebhookSecretEnc: true } as const;

/**
 * Decrypt an encrypted secret, NEVER throwing. A corrupt/undecryptable stored value
 * (e.g. saved under a different secret, or malformed) must not crash the caller —
 * for money/analytics config a bad token has to degrade to "unset", not take down the
 * live opt-in or checkout. Returns null on any failure so the platform falls back to
 * env and a tenant is simply treated as unconfigured.
 */
function safeDecrypt(enc: string | null | undefined): string | null {
  if (!enc) return null;
  try {
    return decryptWithSecret(enc, env.BETTER_AUTH_SECRET);
  } catch (e) {
    console.error("[settings/config] secret decrypt failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function settingRow<T>(tenantId: string | null, select: T) {
  return tenantId
    ? prisma.appSetting.findUnique({ where: { tenantId }, select: select as never })
    : prisma.appSetting.findUnique({ where: { id: "singleton" }, select: select as never });
}

export interface MetaConfig {
  pixelId: string | null;
  capiToken: string | null;
  datasetId: string | null;
}

/** Resolve a tenant's Meta config (null = platform/Gita → env fallback). */
export async function resolveMetaConfig(tenantId: string | null): Promise<MetaConfig> {
  const s = (await settingRow(tenantId, SEL_META)) as { metaPixelId: string | null; metaCapiTokenEnc: string | null } | null;
  const isPlatform = tenantId === null;
  const pixelId = s?.metaPixelId?.trim() || (isPlatform ? env.NEXT_PUBLIC_META_PIXEL_ID ?? null : null);
  // Stored token wins; a corrupt/undecryptable one falls back to env for the platform
  // (keeps the live Gita funnel firing), or leaves a tenant unconfigured — never throws.
  const capiToken = safeDecrypt(s?.metaCapiTokenEnc) ?? (isPlatform ? env.META_CAPI_ACCESS_TOKEN ?? null : null);
  // Dataset id: the platform can override via env; otherwise the pixel id is the dataset.
  const datasetId = isPlatform ? env.META_DATASET_ID ?? pixelId : pixelId;
  return { pixelId, capiToken, datasetId };
}

export interface RazorpayConfig {
  keyId: string | null;
  keySecret: string | null;
  webhookSecret: string | null;
}

/** Resolve a tenant's Razorpay config (null = platform/Gita → env fallback). */
export async function resolveRazorpayConfig(tenantId: string | null): Promise<RazorpayConfig> {
  const s = (await settingRow(tenantId, SEL_RZP)) as {
    razorpayKeyId: string | null;
    razorpayKeySecretEnc: string | null;
    razorpayWebhookSecretEnc: string | null;
  } | null;
  const isPlatform = tenantId === null;
  return {
    keyId: s?.razorpayKeyId?.trim() || (isPlatform ? env.RAZORPAY_KEY_ID ?? null : null),
    keySecret: safeDecrypt(s?.razorpayKeySecretEnc) ?? (isPlatform ? env.RAZORPAY_KEY_SECRET ?? null : null),
    webhookSecret: safeDecrypt(s?.razorpayWebhookSecretEnc) ?? (isPlatform ? env.RAZORPAY_WEBHOOK_SECRET ?? null : null),
  };
}
