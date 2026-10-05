// Deliberately NOT `server-only`. The Railway cron (tsx scripts/sweep-abandoned.ts)
// resolves a tenant's Meta config to fire AssessmentAbandoned, and that process runs
// outside Next, where the `server-only` package does not resolve at all - importing
// it there is a hard crash that would take the whole cron down, existing sweeps
// included. The guard only ever prevented CLIENT bundling, which the prisma/env/
// crypto imports below already make impossible in a browser build.
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { decryptWithSecret } from "@/lib/crypto";
import { isPlatformScope } from "@/lib/tenant/platform-tenant";
import { appSettingWhere } from "@/lib/settings/tenant-row";

/**
 * Per-tenant integration config (Meta pixel/CAPI, Razorpay), resolved from the
 * AppSetting row - NOT env. A tenant reads its OWN row and never falls back.
 *
 * ENV IS FOR LAUNCHING THE APP, NOT FOR CONFIGURING TENANTS.
 * That is the standing rule: environment variables hold only what the process needs
 * to boot (database URL, auth secret, app URL, object storage). Every integration
 * value - pixel, CAPI token, Razorpay keys, AI keys, SMTP, WhatsApp - belongs in
 * in-app Settings, stored per tenant, because a per-tenant value cannot live in a
 * single process-wide variable without one tenant inheriting another's.
 *
 * The env reads below are a TRANSITIONAL fallback for the platform scope ONLY, kept
 * so the live funnel does not go dark between this commit and the re-home. Each one
 * logs which value it served from env, so the remaining gaps are visible rather than
 * silently permanent. `npm run settings:from-env` copies them into Settings; once the
 * gap report is clean, delete the fallback and the vars together.
 *
 * 🔴 The fallback does NOT apply to a business tenant. Moving the funnel onto its own
 * tenant therefore requires its AppSetting row to be populated FIRST - a blank row
 * means no pixel, no CAPI and a checkout that cannot sign an order.
 */

/**
 * Note that a value was served from env rather than Settings. Logged once per key per
 * process (not per request - this sits on the funnel hot path) so a deploy's logs name
 * exactly what still has to be entered in Settings, without flooding them.
 */
const envFallbacksWarned = new Set<string>();
function noteEnvFallback(key: string): void {
  if (envFallbacksWarned.has(key)) return;
  envFallbacksWarned.add(key);
  console.warn(
    `[settings/config] ${key} came from an environment variable, not Settings. ` +
      `Enter it in Settings for the platform tenant - env is for launching the app only. ` +
      `(npm run settings:from-env copies it across.)`,
  );
}

/** Serve `stored`, or fall back to env for the platform scope while noting the gap. */
function orEnv(stored: string | null, isPlatform: boolean, key: string, envValue: string | null | undefined): string | null {
  if (stored) return stored;
  if (!isPlatform) return null;
  const v = envValue ?? null;
  if (v) noteEnvFallback(key);
  return v;
}

const SEL_META = { metaPixelId: true, metaCapiTokenEnc: true } as const;
const SEL_RZP = { razorpayKeyId: true, razorpayKeySecretEnc: true, razorpayWebhookSecretEnc: true } as const;

/**
 * Decrypt an encrypted secret, NEVER throwing. A corrupt/undecryptable stored value
 * (e.g. saved under a different secret, or malformed) must not crash the caller -
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

/**
 * The AppSetting row for a tenant. Addressing goes through appSettingWhere so the
 * platform resolves to the singleton row whether it arrives as null (pre-re-home) or
 * as PLATFORM_TENANT_ID (post) - one row, reachable by either name.
 */
async function settingRow<T>(tenantId: string | null, select: T) {
  return prisma.appSetting.findUnique({
    where: appSettingWhere(tenantId) as never,
    select: select as never,
  });
}

export interface MetaConfig {
  pixelId: string | null;
  capiToken: string | null;
  datasetId: string | null;
}

/** Resolve a tenant's Meta config (the platform scope keeps a transitional env fallback). */
export async function resolveMetaConfig(tenantId: string | null): Promise<MetaConfig> {
  const s = (await settingRow(tenantId, SEL_META)) as { metaPixelId: string | null; metaCapiTokenEnc: string | null } | null;
  const isPlatform = isPlatformScope(tenantId);
  const pixelId = orEnv(s?.metaPixelId?.trim() || null, isPlatform, "NEXT_PUBLIC_META_PIXEL_ID", env.NEXT_PUBLIC_META_PIXEL_ID);
  // Stored token wins; a corrupt/undecryptable one falls back to env for the platform
  // (keeps the live funnel firing), or leaves a tenant unconfigured - never throws.
  const capiToken = orEnv(safeDecrypt(s?.metaCapiTokenEnc), isPlatform, "META_CAPI_ACCESS_TOKEN", env.META_CAPI_ACCESS_TOKEN);
  // Dataset id: for a tenant the pixel id IS the dataset. The platform may still point
  // CAPI at a different dataset via env - 🟡 if that var is set to something other than
  // the pixel id, events change destination the moment the funnel moves to a tenant,
  // because a tenant has no equivalent override. Check it before re-homing.
  const datasetId = isPlatform ? env.META_DATASET_ID ?? pixelId : pixelId;
  if (isPlatform && env.META_DATASET_ID) noteEnvFallback("META_DATASET_ID");
  return { pixelId, capiToken, datasetId };
}

export interface PlatformMetaConfig {
  pixelId: string | null;
  capiToken: string | null;
}

/**
 * The Assess360 SaaS-funnel pixel (landing / signup / subscription) - a SEPARATE
 * Meta pixel from the Gita assessment one resolved by resolveMetaConfig. Read ONLY
 * from the singleton row; NO env fallback (a brand-new pixel), so it stays inert
 * until the super admin sets it in Settings. Never throws.
 */
export async function resolvePlatformMetaConfig(): Promise<PlatformMetaConfig> {
  const s = (await settingRow(null, { platformPixelId: true, platformCapiTokenEnc: true })) as {
    platformPixelId: string | null;
    platformCapiTokenEnc: string | null;
  } | null;
  return { pixelId: s?.platformPixelId?.trim() || null, capiToken: safeDecrypt(s?.platformCapiTokenEnc) };
}

/**
 * Resolve a tenant's heatmap/recording snippet (e.g. MS Clarity). Read from the
 * tenant's own AppSetting row; the platform/Gita path reads the singleton. No env
 * fallback (new feature) - null/blank means the funnel injects nothing.
 */
export async function resolveHeatmapCode(tenantId: string | null): Promise<string | null> {
  const s = (await settingRow(tenantId, { heatmapCode: true })) as { heatmapCode: string | null } | null;
  return s?.heatmapCode?.trim() || null;
}

/**
 * Resolve a tenant's canonical audience list (the "default list of roles"). Feeds
 * the free-text audience field's suggestions and the normalize screen. Stored as a
 * JSON array of labels on the tenant's own AppSetting row (platform => singleton).
 * Anything non-string / blank is dropped; null/absent => empty list.
 */
export async function resolveAudienceCanonical(tenantId: string | null): Promise<string[]> {
  const s = (await settingRow(tenantId, { audienceCanonical: true })) as { audienceCanonical: unknown } | null;
  const raw = s?.audienceCanonical;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);
}

/** Resolve a tenant's Nurture message config (the email + WhatsApp content/toggles). */
export async function resolveNurtureConfig(tenantId: string | null) {
  const s = (await settingRow(tenantId, { nurtureConfig: true })) as { nurtureConfig: unknown } | null;
  const { readNurtureConfig } = await import("@/features/nurture/config");
  return readNurtureConfig(s?.nurtureConfig ?? null);
}

export interface RazorpayConfig {
  keyId: string | null;
  keySecret: string | null;
  webhookSecret: string | null;
}

export interface SmtpConfig {
  host: string | null;
  port: number | null;
  secure: boolean;
  user: string | null;
  pass: string | null;
  fromName: string | null;
  fromEmail: string | null;
}

/** Resolve a tenant's SMTP config (its own row; singleton for platform). No env
 *  fallback - an unconfigured tenant simply cannot send email. */
export async function resolveSmtpConfig(tenantId: string | null): Promise<SmtpConfig> {
  const s = (await settingRow(tenantId, {
    smtpHost: true,
    smtpPort: true,
    smtpSecure: true,
    smtpUser: true,
    smtpPassEnc: true,
    smtpFromName: true,
    smtpFromEmail: true,
  })) as {
    smtpHost: string | null;
    smtpPort: number | null;
    smtpSecure: boolean;
    smtpUser: string | null;
    smtpPassEnc: string | null;
    smtpFromName: string | null;
    smtpFromEmail: string | null;
  } | null;
  return {
    host: s?.smtpHost?.trim() || null,
    port: s?.smtpPort ?? null,
    secure: s?.smtpSecure ?? false,
    user: s?.smtpUser?.trim() || null,
    // 🔴 Trim on READ, not just on save. An API token pasted out of a provider console
    // very often carries a trailing newline or space, and a credential is sent
    // verbatim - ZeptoMail answers a token with one stray character as
    // "SERR_157 Invalid API Token found", which reads like a wrong key and sends you
    // hunting for the wrong thing. Trimming here also repairs rows that were already
    // saved with the whitespace, with no re-save needed.
    pass: safeDecrypt(s?.smtpPassEnc)?.trim() || null,
    fromName: s?.smtpFromName?.trim() || null,
    fromEmail: s?.smtpFromEmail?.trim() || null,
  };
}

export interface WabaConfig {
  phoneNumberId: string | null;
  businessAccountId: string | null;
  accessToken: string | null;
  apiVersion: string;
  defaultCountryCode: string;
}

/** Resolve a tenant's Meta WhatsApp Cloud API config (its own row; singleton for
 *  platform). apiVersion/countryCode fall back to sane defaults when blank. */
export async function resolveWabaConfig(tenantId: string | null): Promise<WabaConfig> {
  const s = (await settingRow(tenantId, {
    wabaPhoneNumberId: true,
    wabaBusinessAccountId: true,
    wabaAccessTokenEnc: true,
    wabaApiVersion: true,
    wabaDefaultCountryCode: true,
  })) as {
    wabaPhoneNumberId: string | null;
    wabaBusinessAccountId: string | null;
    wabaAccessTokenEnc: string | null;
    wabaApiVersion: string | null;
    wabaDefaultCountryCode: string | null;
  } | null;
  return {
    phoneNumberId: s?.wabaPhoneNumberId?.trim() || null,
    businessAccountId: s?.wabaBusinessAccountId?.trim() || null,
    accessToken: safeDecrypt(s?.wabaAccessTokenEnc),
    apiVersion: s?.wabaApiVersion?.trim() || "v21.0",
    defaultCountryCode: s?.wabaDefaultCountryCode?.trim() || "91",
  };
}

/** Resolve a tenant's Razorpay config (the platform scope keeps a transitional env fallback). */
export async function resolveRazorpayConfig(tenantId: string | null): Promise<RazorpayConfig> {
  const s = (await settingRow(tenantId, SEL_RZP)) as {
    razorpayKeyId: string | null;
    razorpayKeySecretEnc: string | null;
    razorpayWebhookSecretEnc: string | null;
  } | null;
  const isPlatform = isPlatformScope(tenantId);
  return {
    keyId: orEnv(s?.razorpayKeyId?.trim() || null, isPlatform, "RAZORPAY_KEY_ID", env.RAZORPAY_KEY_ID),
    keySecret: orEnv(safeDecrypt(s?.razorpayKeySecretEnc), isPlatform, "RAZORPAY_KEY_SECRET", env.RAZORPAY_KEY_SECRET),
    webhookSecret: orEnv(safeDecrypt(s?.razorpayWebhookSecretEnc), isPlatform, "RAZORPAY_WEBHOOK_SECRET", env.RAZORPAY_WEBHOOK_SECRET),
  };
}
