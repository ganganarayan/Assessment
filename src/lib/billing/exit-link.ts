import "server-only";
import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * The signed hand-off from "you have cancelled" to the owner's exit survey.
 *
 * WHY IT EXISTS. The survey is an ordinary public assessment, so without this a
 * cancelling customer lands on a cold opt-in form and is asked to type the name and
 * email the product has had on file for months. A person who has just quit will close
 * that tab, and the one question the owner actually needs answered goes unanswered -
 * not because they refused, but because of a form.
 *
 * WHAT IT IS NOT. Not a credential. It prefills two fields on a public page and grants
 * nothing: no session, no access, no read of anybody's data. It is signed so the
 * prefilled identity cannot be forged into somebody else's name, and it expires so a
 * link pasted into a ticket a year later stops carrying an email address around.
 *
 * The workspace id rides along so the answers can be tied back to the account that
 * cancelled without the respondent typing anything.
 */

/** A week. Long enough to come back to the link, short enough that it stops existing. */
const TTL_SECONDS = 7 * 24 * 60 * 60;

export interface ExitTokenPayload {
  /** Workspace that cancelled. */
  tenantId: string;
  /** Prefill, both optional - an account may have neither recorded. */
  firstName?: string | null;
  email?: string | null;
}

interface Wire {
  t: string;
  n?: string;
  e?: string;
  x: number;
}

const b64url = (b: Buffer): string => b.toString("base64url");

function sign(body: string): string {
  return crypto.createHmac("sha256", env.BETTER_AUTH_SECRET).update(body).digest("base64url");
}

/** Mint the token. Returns the opaque string to put in the `x` query parameter. */
export function signExitToken(p: ExitTokenPayload): string {
  const wire: Wire = {
    t: p.tenantId,
    ...(p.firstName?.trim() ? { n: p.firstName.trim().slice(0, 80) } : {}),
    ...(p.email?.trim() ? { e: p.email.trim().slice(0, 160) } : {}),
    x: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  const body = b64url(Buffer.from(JSON.stringify(wire), "utf8"));
  return `${body}.${sign(body)}`;
}

/**
 * Read a token back. Returns null for anything that is not a token this server signed
 * and that has not expired - a tampered payload, a truncated copy/paste, a link from
 * another environment (different secret), or one that is simply old.
 *
 * Never throws: it runs on a public page, where a junk query parameter is a visitor
 * being a visitor, not an error.
 */
export function readExitToken(token: string | undefined | null): ExitTokenPayload | null {
  if (!token || typeof token !== "string" || token.length > 2000) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  const expected = sign(body);
  // Constant-time, and length-guarded because timingSafeEqual throws on a mismatch.
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;

  try {
    const wire = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Wire;
    if (!wire || typeof wire.t !== "string" || !wire.t) return null;
    if (typeof wire.x !== "number" || wire.x * 1000 < Date.now()) return null;
    return {
      tenantId: wire.t,
      firstName: typeof wire.n === "string" ? wire.n : null,
      email: typeof wire.e === "string" ? wire.e : null,
    };
  } catch {
    return null;
  }
}

/**
 * Build the link a cancelling customer is sent to: the owner's configured survey, plus
 * the signed prefill and the attribution that lets the owner split "never activated"
 * from "activated and left" in their own submissions table.
 *
 * Returns null when no survey is configured, which is a supported state: the cancel
 * then simply confirms. Anything that is not a parseable URL is returned untouched
 * rather than dropped, because a slightly wrong setting should still take somebody
 * somewhere rather than silently become no step at all.
 */
export function buildExitLink(
  configuredUrl: string | null,
  p: ExitTokenPayload & { tenantSlug?: string | null },
): string | null {
  const base = configuredUrl?.trim();
  if (!base) return null;
  try {
    const u = new URL(base);
    u.searchParams.set("x", signExitToken(p));
    u.searchParams.set("utm_source", "cancellation");
    u.searchParams.set("utm_medium", "app");
    if (p.tenantSlug) u.searchParams.set("utm_campaign", p.tenantSlug);
    return u.toString();
  } catch {
    return base;
  }
}
