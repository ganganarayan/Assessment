/**
 * Nurture message config (stored on AppSetting.nurtureConfig) + the lead-placeholder
 * substitution shared by the sender, the test-send, and the builder preview. Plain
 * module (client + server safe): no "use server", no DB, no secrets.
 */

export interface NurtureEmailConfig {
  enabled: boolean;
  subject: string;
  body: string; // HTML or plain text
}
export interface NurtureWabaConfig {
  enabled: boolean;
  template: string; // approved Meta template name
  lang: string; // template language code, e.g. "en" / "en_US"
  vars: string[]; // ordered body variables ({{1}},{{2}}…) — each text or a placeholder
}
export interface NurtureConfig {
  email: NurtureEmailConfig;
  waba: NurtureWabaConfig;
}

export const EMPTY_NURTURE_CONFIG: NurtureConfig = {
  email: { enabled: false, subject: "", body: "" },
  waba: { enabled: false, template: "", lang: "en", vars: [] },
};

/** Coerce a stored nurtureConfig JSON value into a well-formed config (never throws). */
export function readNurtureConfig(value: unknown): NurtureConfig {
  const v = (value ?? {}) as Partial<{ email: Partial<NurtureEmailConfig>; waba: Partial<NurtureWabaConfig> }>;
  const e = v.email ?? {};
  const w = v.waba ?? {};
  return {
    email: {
      enabled: e.enabled === true,
      subject: typeof e.subject === "string" ? e.subject : "",
      body: typeof e.body === "string" ? e.body : "",
    },
    waba: {
      enabled: w.enabled === true,
      template: typeof w.template === "string" ? w.template : "",
      lang: typeof w.lang === "string" && w.lang.trim() ? w.lang : "en",
      vars: Array.isArray(w.vars) ? w.vars.map((x) => (typeof x === "string" ? x : "")) : [],
    },
  };
}

/** The lead fields available as {{placeholders}} in messages. */
export interface LeadFields {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  mobile?: string | null;
  profession?: string | null;
}

export const NURTURE_PLACEHOLDERS = [
  "firstName",
  "lastName",
  "name",
  "email",
  "mobile",
  "profession",
  "resultUrl",
] as const;

/** Replace {{firstName}} etc. with the lead's values (blank when unknown). Unknown
 *  placeholders are left as-is so a typo is visible rather than silently dropped.
 *  `extra` carries non-lead values such as the completion result URL ({{resultUrl}}). */
export function fillPlaceholders(template: string, lead: LeadFields, extra?: { resultUrl?: string | null }): string {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
  const map: Record<string, string> = {
    firstName: (lead.firstName ?? "").trim(),
    lastName: (lead.lastName ?? "").trim(),
    name: name || (lead.firstName ?? "").trim(),
    email: (lead.email ?? "").trim(),
    mobile: (lead.mobile ?? "").trim(),
    profession: (lead.profession ?? "").trim(),
    resultUrl: (extra?.resultUrl ?? "").trim(),
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => map[key] ?? whole);
}

/**
 * Normalize a mobile to E.164 digits (no "+") for the WhatsApp Cloud API.
 *  - strips spaces, dashes, parens and a leading "+"
 *  - drops a single leading "0" (local trunk prefix)
 *  - prepends the tenant's default country code when the number is a bare local one
 * Returns null when there aren't enough digits to be a real number.
 */
export function toE164Digits(mobile: string | null | undefined, defaultCountryCode: string): string | null {
  if (!mobile) return null;
  const hadPlus = mobile.trim().startsWith("+");
  let d = mobile.replace(/[^\d]/g, "");
  if (!d) return null;
  const cc = (defaultCountryCode || "").replace(/[^\d]/g, "");
  if (hadPlus) return d.length >= 8 ? d : null; // already international
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  // Bare local (typical 10-digit) number → prepend the country code. If it already
  // starts with the country code and is long enough, assume it's already full.
  if (cc && !(d.startsWith(cc) && d.length >= cc.length + 8)) d = cc + d;
  return d.length >= 8 ? d : null;
}
