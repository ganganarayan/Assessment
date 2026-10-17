import { z } from "zod";

/**
 * Shared shapes for WhatsApp one-click onboarding. A PLAIN module on purpose: the
 * actions file carries "use server" and may therefore export only async functions, so
 * anything a client component needs to import by type has to live here.
 */

/** What Meta's popup hands back when the business finishes. */
export interface EmbeddedSignupResult {
  /** Exchangeable token code. Lives ~30 seconds, so it goes straight to the server. */
  code: string;
  wabaId: string;
  /** Absent on the coexistence finish event, which carries the WABA only. */
  phoneNumberId: string | null;
  businessId: string | null;
}

/** The number that is live on this scope right now. */
export interface ConnectedWaba {
  phoneNumberId: string;
  wabaId: string;
  displayPhone: string;
  verifiedName: string;
  /** True = the number is ALSO on the WhatsApp Business app, i.e. real coexistence. */
  isOnBizApp: boolean;
  /** Already formatted DD-MM-YYYY HH:MM IST, so no client-side locale can undo it. */
  onboardedAt: string | null;
  /** How it got here. A number typed in by hand has no onboarding to report. */
  source: "COEXISTENCE" | "MANUAL";
}

export interface WhatsAppConnectView {
  /**
   * The platform's Meta app is complete enough to launch the popup. False hides the
   * button rather than offering one that dead-ends in Meta's error screen.
   */
  ready: boolean;
  appId: string;
  configId: string;
  graphVersion: string;
  connected: ConnectedWaba | null;
  /** The last connect failure, verbatim from Meta. Cleared by the next success. */
  lastError: string | null;
}

/**
 * What the browser is allowed to send us after the popup closes.
 *
 * Validated rather than trusted: this is a public server action, and the ids go
 * straight into Graph paths. Meta's ids are numeric strings, so anything else is
 * rejected before it can be interpolated into a URL.
 */
export const embeddedSignupSchema = z.object({
  code: z.string().trim().min(10).max(2000),
  wabaId: z.string().trim().regex(/^\d{5,25}$/, "That is not a WhatsApp Business Account id."),
  phoneNumberId: z
    .string()
    .trim()
    .regex(/^\d{5,25}$/)
    .nullish(),
  businessId: z
    .string()
    .trim()
    .regex(/^\d{5,25}$/)
    .nullish(),
});

/**
 * The platform owner's view of the Meta app behind every tenant's connect button.
 * Secrets come back as booleans only, like every other credential screen here.
 */
export interface MetaAppSettingsView {
  appId: string;
  hasSecret: boolean;
  /** Facebook Login for Business configuration id. */
  configId: string;
  hasVerifyToken: boolean;
  /** The callback URL to paste into the Meta app, built from this deployment. */
  webhookUrl: string;
  graphVersion: string;
}
