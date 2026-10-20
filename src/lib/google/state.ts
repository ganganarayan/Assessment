import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The OAuth `state` parameter: who started this connect, signed so it cannot be forged.
 *
 * PURE (node crypto only, no DB, no env), so scripts/verify-calendar.ts can prove the
 * round trip and the tamper cases without a server.
 *
 * 🔴 WHAT THE SIGNATURE IS FOR. Google hands the authorisation code back to our callback
 * with whatever `state` it was given. Unsigned, state is attacker-controlled input that
 * says "store these tokens against THIS workspace and THIS calendar" - so anybody who
 * can make an owner's browser follow a link could attach their own Google account to
 * somebody else's calendar, or their victim's account to their own. HMAC over the whole
 * payload makes it unforgeable without the server secret.
 *
 * The timestamp makes a captured state useless later: a consent screen left open for an
 * hour is a dead link rather than a replay.
 */

export interface OAuthState {
  tenantId: string;
  /** The calendar being connected: a staff id, or "shared" for the workspace one. */
  calendarKey: string;
  /** Where to send the browser afterwards. A PATH, never a URL - see parseState. */
  returnTo: string;
  issuedAtMs: number;
}

/** How long a consent round trip may take. Past this the state is refused. */
export const STATE_TTL_MS = 15 * 60_000;

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64url = (s: string) => Buffer.from(s, "base64url").toString("utf8");

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Build the signed state to hand to Google. */
export function buildState(state: OAuthState, secret: string): string {
  const payload = b64url(JSON.stringify(state));
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Verify and unpack what came back. Returns null for anything that is not exactly a
 * state we issued, recently: wrong shape, bad signature, expired, or a returnTo that is
 * not a local path.
 */
export function parseState(raw: string, secret: string, nowMs = Date.now()): OAuthState | null {
  const [payload, mac] = raw.split(".");
  if (!payload || !mac) return null;

  // Constant-time, and length-guarded because timingSafeEqual throws on a mismatch.
  const expected = Buffer.from(sign(payload, secret), "utf8");
  const given = Buffer.from(mac, "utf8");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(unb64url(payload));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const s = parsed as Partial<OAuthState>;
  if (typeof s.tenantId !== "string" || !s.tenantId) return null;
  if (typeof s.calendarKey !== "string" || !s.calendarKey) return null;
  if (typeof s.issuedAtMs !== "number" || !Number.isFinite(s.issuedAtMs)) return null;
  if (nowMs - s.issuedAtMs > STATE_TTL_MS || s.issuedAtMs > nowMs + 60_000) return null;

  /**
   * 🔴 An OPEN REDIRECT is the other way this parameter gets abused: send somebody to
   * our own domain, have us bounce them to an attacker's page, and the link looks like
   * ours in every preview. So returnTo must be a local absolute path, and "//evil.com"
   * is rejected too - browsers read a protocol-relative URL as another origin.
   */
  const returnTo = typeof s.returnTo === "string" ? s.returnTo : "";
  const safeReturn = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/w/calendar/availability";

  return {
    tenantId: s.tenantId,
    calendarKey: s.calendarKey,
    returnTo: safeReturn,
    issuedAtMs: s.issuedAtMs,
  };
}
