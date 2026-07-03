import { fbcFromFbclid, type CapiUserData } from "@/lib/meta/capi";

/**
 * Meta STANDARD Purchase event name. Every Purchase source — the external
 * thank-you page browser pixel, this server CAPI, and any re-send — MUST use this
 * same name AND the same event_id (the Razorpay payment id) or Meta double-counts.
 */
export const PURCHASE_EVENT_NAME = "Purchase";

/** The submission fields needed to build a fully-attributed Purchase. */
export interface PurchaseAttributionSource {
  leadEmail: string | null;
  leadMobile: string | null;
  leadFirstName: string | null;
  leadLastName: string | null;
  attribution: unknown;
  fbc: string | null;
  fbp: string | null;
  clientIp: string | null;
  userAgent: string | null;
  fbclidTimestamp: number | null; // unix MILLISECONDS
  createdAt: Date;
}

/**
 * Build the full CAPI user_data for a Purchase: hashed PII (email/phone/name) plus
 * every captured match signal. fbc prefers the REAL stored _fbc verbatim; when
 * absent it is rebuilt from the fbclid + its millisecond timestamp (falling back to
 * the opt-in/createdAt time). Raising match quality is what lets Meta ATTRIBUTE the
 * server conversion to the ad click.
 */
export function buildPurchaseUserData(s: PurchaseAttributionSource): CapiUserData {
  const fbclid = (s.attribution as { fbclid?: string } | null)?.fbclid ?? null;
  const fbc = s.fbc ?? fbcFromFbclid(fbclid, s.fbclidTimestamp ?? s.createdAt.getTime());
  return {
    email: s.leadEmail,
    phone: s.leadMobile,
    firstName: s.leadFirstName,
    lastName: s.leadLastName,
    fbc,
    fbp: s.fbp,
    clientIpAddress: s.clientIp,
    clientUserAgent: s.userAgent,
  };
}
