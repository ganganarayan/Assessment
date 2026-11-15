import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * The signed TEST LINK: how an owner walks their own funnel without being a real visitor.
 *
 * ?preview=1 stays exactly as it is, for every workspace: it is the builder's and the
 * publish screen's link, and it keeps the browser pixel on so the owner can watch Pixel
 * Helper. The test link is the stricter sibling Claude hands out:
 *
 *   /a/<slug>/test/<token>  ->  sets a short-lived cookie  ->  /a/<slug>?preview=1
 *
 * With the cookie present for THIS assessment, the run is a preview in every sense the
 * app already knows (flagged rows, no server CAPI, no rejection lock), and on top:
 * the browser pixel is not loaded at all, the retake lock is bypassed, and a draft opens
 * without signing in. So the owner can test from a phone and lands in no Meta audience.
 *
 * The token is HMAC-signed with the auth secret and carries the assessment id and an
 * expiry, so it cannot be guessed or moved to another funnel.
 */

export const TEST_COOKIE = "a360_test";
const TOKEN_DAYS = 7;
/** The cookie outlives one testing session, not the whole token. */
export const TEST_COOKIE_SECONDS = 60 * 60 * 12;

function sign(body: string): string {
  return createHmac("sha256", `${env.BETTER_AUTH_SECRET}:funnel-test-link`).update(body).digest("base64url");
}

export function mintTestToken(assessmentId: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + TOKEN_DAYS * 86400;
  const body = Buffer.from(`${assessmentId}.${exp}`).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** The assessment id a token was minted for, or null when it is forged, malformed or expired. */
export function verifyTestToken(token: string | undefined | null, now = Date.now()): { assessmentId: string; expiresAt: Date } | null {
  if (!token || token.length > 300) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const decoded = Buffer.from(body, "base64url").toString("utf8");
  const dot = decoded.lastIndexOf(".");
  const assessmentId = decoded.slice(0, dot);
  const exp = Number(decoded.slice(dot + 1));
  if (dot <= 0 || !Number.isFinite(exp) || exp * 1000 < now) return null;
  return { assessmentId, expiresAt: new Date(exp * 1000) };
}

/** The test link for one funnel on its public origin. */
export function testLinkUrl(origin: string, slug: string, assessmentId: string): { url: string; expiresAt: Date } {
  const token = mintTestToken(assessmentId);
  const v = verifyTestToken(token);
  return { url: `${origin.replace(/\/+$/, "")}/a/${slug}/test/${token}`, expiresAt: v?.expiresAt ?? new Date() };
}

/** True when this request carries a valid test cookie for this assessment. */
export async function isTestRunFor(assessmentId: string): Promise<boolean> {
  try {
    const c = await cookies();
    return verifyTestToken(c.get(TEST_COOKIE)?.value)?.assessmentId === assessmentId;
  } catch {
    return false; // no request scope (a script, a cron): never a test run
  }
}
