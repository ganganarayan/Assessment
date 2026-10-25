import { z } from "zod";

/**
 * Shared shapes for WhatsApp one-click onboarding. A PLAIN module on purpose: the
 * actions file carries "use server" and may therefore export only async functions, so
 * anything a client component needs to import by type has to live here.
 */

/**
 * Which of Meta's two finish events closed the popup.
 *
 * COEXISTENCE means the business connected a number that is already live on the
 * WhatsApp Business app on their phone. CLOUD means the ordinary path: a number that
 * belongs to the Cloud API alone.
 *
 * 🔴 This is a HINT, never the record. It arrives from the browser, so it is only as
 * trustworthy as the page that sent it; what actually gets stored is Meta's own
 * is_on_biz_app, read back through Graph with our token. The hint exists so the server
 * can notice the two disagreeing and say so, which is the one case a business owner
 * cannot diagnose for themselves.
 */
export type SignupFlow = "COEXISTENCE" | "CLOUD";

/** What Meta's popup hands back when the business finishes. */
export interface EmbeddedSignupResult {
  /** Exchangeable token code. Lives ~30 seconds, so it goes straight to the server. */
  code: string;
  wabaId: string;
  /** Absent on the coexistence finish event, which carries the WABA only. */
  phoneNumberId: string | null;
  businessId: string | null;
  flow: SignupFlow;
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
  /**
   * How it got here, decided from what Meta reports rather than from how it was asked
   * for: one click plus is_on_biz_app is coexistence, one click without it is a plain
   * Cloud API number, and a number typed in by hand has no onboarding to report.
   *
   * The distinction is not cosmetic. Only a coexistence number can sync contacts and
   * history, and only a coexistence number keeps answering on somebody's phone.
   */
  source: "COEXISTENCE" | "CLOUD_API" | "MANUAL";
  sync: WabaSyncView;
}

/**
 * The one chance to bring the owner's own contacts and chats off their phone.
 *
 * Everything here is about a decision that cannot be taken twice, so the card needs
 * enough to say WHY a button is not offered, rather than just hiding it: a cloud number
 * can never sync, a sync already asked for cannot be asked for again, and the 24 hours
 * run from the moment they connected.
 */
export interface WabaSyncView {
  /** False for a cloud or hand-typed number, which has no phone to sync from. */
  available: boolean;
  /** When we asked, DD-MM-YYYY HH:MM IST. Null means never asked. */
  contactsAt: string | null;
  historyAt: string | null;
  /** When the chance runs out, DD-MM-YYYY HH:MM IST. */
  closesAt: string | null;
  /** "about 7 hours left", or that the 24 hours are up. */
  timeLeft: string | null;
  windowOpen: boolean;
  /** The last refusal, verbatim from Meta. A failed sync is not a failed connection. */
  lastError: string | null;
}

/** Which pile of their own data the owner asked for. */
export type SyncKind = "CONTACTS" | "HISTORY";

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
  // Defaulted rather than required, so an older cached page that posts without it
  // still connects instead of failing on a field used only for one warning.
  flow: z.enum(["COEXISTENCE", "CLOUD"]).default("CLOUD"),
});

/**
 * Which sync, validated rather than trusted: it decides which of two single-use
 * requests gets spent, so a malformed value must never fall through to a default.
 */
export const syncKindSchema = z.enum(["CONTACTS", "HISTORY"]);

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
