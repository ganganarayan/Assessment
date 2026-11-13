/**
 * The closed list of stored secrets a Copy button may ask for.
 *
 * The client sends one of these NAMES, never a column name, so a crafted request
 * cannot read an arbitrary field. Each name maps to exactly one encrypted column in
 * the server action (features/secrets/actions.ts), and the action decides which row.
 *
 * Two kinds:
 *  - SCOPED: lives on the caller's own AppSetting row (the platform row for a super
 *    admin with no workspace entered, the entered or own workspace otherwise).
 *  - PLATFORM: lives only on the platform row; super admin only.
 * Plus two that point at a specific record by id (ad account, vault bucket).
 */
export const SCOPED_SECRETS = [
  "metaCapiToken",
  "razorpayKeySecret",
  "razorpayWebhookSecret",
  "razorpayNonGstKeySecret",
  "razorpayNonGstWebhookSecret",
  "emailApiKey",
  "smtpPass",
  "wabaAccessToken",
  "aiClaudeKey",
  "aiOpenAiKey",
  "aiGeminiKey",
] as const;

export const PLATFORM_SECRETS = [
  "platformCapiToken",
  "metaAppSecret",
  "metaWebhookVerifyToken",
  "aiClaudeAdminKey",
  "aiOpenAiAdminKey",
  "r2SecretAccessKey",
  "googleClientSecret",
  "zoomClientSecret",
] as const;

export const RECORD_SECRETS = ["adAccountCapiToken", "vaultBucketSecret"] as const;

export type ScopedSecret = (typeof SCOPED_SECRETS)[number];
export type PlatformSecret = (typeof PLATFORM_SECRETS)[number];
export type RecordSecret = (typeof RECORD_SECRETS)[number];
export type SecretName = ScopedSecret | PlatformSecret | RecordSecret;

/** What the secret actions hand back: the value, once, for the clipboard only. */
export type SecretResult = { ok: true; value: string } | { ok: false; error: string };

/** Which Razorpay account a regenerated webhook secret belongs to. */
export type WebhookAccount = "gst" | "nonGst";
