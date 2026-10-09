// Deliberately NOT `server-only`. The Railway cron (tsx scripts/sweep-abandoned.ts)
// resolves a tenant's Meta config to fire AssessmentAbandoned, and that process runs
// outside Next, where the `server-only` package does not resolve at all - importing
// it there is a hard crash that would take the whole cron down, existing sweeps
// included. The guard only ever prevented CLIENT bundling, which the prisma/env/
// crypto imports below already make impossible in a browser build.
import { prisma } from "@/lib/db/prisma";
import { OFFER_SLOTS } from "@/lib/marketing/content";
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

/**
 * Resolve the ONE Meta pixel for a scope.
 *
 * Exactly one pixel exists per scope and it is stored in exactly one place:
 *   platform -> platformPixelId / platformCapiTokenEnc
 *   tenant   -> metaPixelId     / metaCapiTokenEnc
 *
 * It used to be two at platform scope: the funnel read metaPixelId while the SaaS
 * signup and subscription read platformPixelId. Putting the same pixel in both - the
 * only sane thing to do when one pixel is all you have - meant two independent senders
 * firing CompleteRegistration for the same person with different event ids, which Meta
 * cannot deduplicate because they are not the same event. One person counted twice,
 * and a cost per result 40% below the truth.
 *
 * NO ENV FALLBACK. Env is for launching the app, not for configuring a funnel: a
 * fallback means the pixel a funnel fires on depends on which environment it is in,
 * and a blank setting silently keeps working off a value nobody can see in the UI.
 * Blank now means silent, which is visible and therefore fixable.
 */
export async function resolveMetaConfig(tenantId: string | null): Promise<MetaConfig> {
  if (isPlatformScope(tenantId)) {
    const { pixelId, capiToken } = await resolvePlatformMetaConfig();
    return { pixelId, capiToken, datasetId: pixelId };
  }
  const s = (await settingRow(tenantId, SEL_META)) as { metaPixelId: string | null; metaCapiTokenEnc: string | null } | null;
  const pixelId = s?.metaPixelId?.trim() || null;
  // A corrupt/undecryptable token degrades to "unset" rather than throwing: a bad
  // secret must never take down a live opt-in.
  const capiToken = safeDecrypt(s?.metaCapiTokenEnc);
  // For a tenant the pixel id IS the dataset id.
  return { pixelId, capiToken, datasetId: pixelId };
}

export interface PlatformMetaConfig {
  pixelId: string | null;
  capiToken: string | null;
}

/**
 * The platform's ONE pixel: the SaaS funnel (landing / signup / subscription) and
 * the platform's own assessment funnel both fire on it. Read only from the singleton
 * row, no env fallback, so blank means the platform fires nothing at all - which is
 * visible, unlike a hidden environment variable quietly keeping a funnel alive.
 *
 * resolveMetaConfig(null) delegates here, so there is one value and no way for the
 * two to disagree.
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

/**
 * The onboarding video shown on a tenant dashboard. Platform-wide: it explains
 * Assess360 itself, so it lives on the singleton row and every workspace sees the same
 * one. Null/blank means the written steps appear on their own, which is deliberate - the
 * steps are the instruction and the video is the nicety.
 */
export async function resolveOnboardingVideoUrl(): Promise<string | null> {
  const s = (await settingRow(null, { onboardingVideoUrl: true })) as { onboardingVideoUrl: string | null } | null;
  return s?.onboardingVideoUrl?.trim() || null;
}

/**
 * The approved WhatsApp template for the /build confirmation, or null.
 *
 * Null means send nothing, which is the state this ships in and the correct one: a Meta
 * template has to be approved in Business Manager before it can be used, and firing at
 * an unapproved name would produce a rejection on every single submission that nobody
 * could fix from inside this app.
 */
export async function resolveDfyWabaTemplate(): Promise<{ template: string; lang: string } | null> {
  const s = (await settingRow(null, { dfyWabaTemplate: true, dfyWabaLang: true })) as
    | { dfyWabaTemplate: string | null; dfyWabaLang: string | null }
    | null;
  const template = s?.dfyWabaTemplate?.trim();
  if (!template) return null;
  return { template, lang: s?.dfyWabaLang?.trim() || "en" };
}

/**
 * Slots left for the announcement bar, or null when the offer should not be advertised.
 *
 * Differs from resolveDfyScarcity in one deliberate way: an UNSET count means the full
 * allowance rather than "say nothing". Before a single build has been done, "20 slots
 * left" is simply true, and making the operator seed a number before the bar appears
 * would mean the offer silently fails to launch.
 *
 * Zero still returns null. A bar reading "0 slots left" above a button that asks for one
 * is worse than no bar.
 */
export async function resolveOfferSlotsLeft(): Promise<number | null> {
  const s = (await settingRow(null, { dfyBuildsTotal: true, dfyBuildsRemaining: true })) as
    | { dfyBuildsTotal: number; dfyBuildsRemaining: number | null }
    | null;
  const total = s?.dfyBuildsTotal ?? OFFER_SLOTS;
  const left = s?.dfyBuildsRemaining ?? total;
  return left > 0 ? Math.min(left, total) : null;
}

/**
 * The done-for-you scarcity counter, or null when there is nothing honest to show.
 *
 * Returns null unless an operator has actually set a remaining count, so an unmaintained
 * counter disappears from the public pages instead of standing there going stale. Also
 * null once it hits zero: "0 of 20 remaining" is a closed door with a call-to-action
 * underneath it, which reads worse than saying nothing.
 */
export async function resolveDfyScarcity(): Promise<{ remaining: number; total: number } | null> {
  const s = (await settingRow(null, { dfyBuildsTotal: true, dfyBuildsRemaining: true })) as
    | { dfyBuildsTotal: number; dfyBuildsRemaining: number | null }
    | null;
  const remaining = s?.dfyBuildsRemaining ?? null;
  if (remaining === null || remaining <= 0) return null;
  const total = s?.dfyBuildsTotal ?? 20;
  // A remaining count above the total is an editing slip, not a claim worth printing.
  return { remaining: Math.min(remaining, total), total };
}

/**
 * The getting-started steps shown on every tenant dashboard, in order.
 *
 * NEVER throws and never returns junk: a malformed value, a non-array, or entries that
 * are not strings all degrade to an empty list, because this renders on the first screen
 * a paying customer ever sees and a crash there is worse than no panel.
 *
 * Blank entries are dropped - an empty numbered row reads as a step somebody forgot to
 * write, which is exactly the impression a getting-started panel must not give.
 */
export async function resolveOnboardingSteps(): Promise<string[]> {
  const row = (await settingRow(null, { onboardingSteps: true })) as { onboardingSteps: unknown } | null;
  const raw = row?.onboardingSteps;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 20);
}
