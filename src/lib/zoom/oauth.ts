import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { encryptWithSecret, decryptWithSecret } from "@/lib/crypto";
import { appSettingWhere } from "@/lib/settings/tenant-row";

/**
 * Zoom OAuth: the consent URL, the code exchange, and keeping a token alive.
 *
 * ONE APP FOR THE WHOLE PRODUCT, on the platform settings row. A tenant clicks Connect,
 * signs into their own Zoom and approves a consent screen - they build nothing and paste
 * nothing. That is the experience the tools people compare us to offer, and it is
 * reachable; what it costs is a Zoom Marketplace review, paid once, by the owner, before
 * accounts outside their own can install the app. It can be published UNLISTED so it
 * never appears in the public directory, and asking for one scope rather than ten is
 * what makes that review short.
 *
 * The alternative - Server-to-Server OAuth - needs no review and makes every tenant
 * create an app and paste three credentials, which is exactly the onboarding nobody
 * completes. It is not built here on purpose.
 */

const AUTH_URL = "https://zoom.us/oauth/authorize";
const TOKEN_URL = "https://zoom.us/oauth/token";
const API = "https://api.zoom.us/v2";

/**
 * What this integration actually needs Zoom to permit. TWO calls, nothing else:
 *
 *   POST /users/me/meetings      make the call's meeting at booking time
 *   DELETE /meetings/{id}        release it when the booking is cancelled
 *
 * 🔴 THIS LIST IS DOCUMENTATION, NOT CONFIGURATION. Zoom takes an OAuth app's scopes
 * from the app's own Marketplace settings and ignores any `scope` parameter on the
 * authorize URL, which is why zoomConsentUrl does not send one. Changing this constant
 * grants nothing; the Scopes screen on the Marketplace is the only thing that does.
 * It is here so the next person can see what to tick without reading two files.
 *
 * Apps created from 2024 onward get GRANULAR scopes, so the old single `meeting:write`
 * no longer covers the delete. Pick the user-level pair, never the `:admin` variants -
 * a user-managed app is authorised by one person for their own account.
 *
 * 🟡 If the delete scope is missing, nothing breaks loudly: a cancelled booking still
 * cancels, and deleteZoomMeeting swallows its own failure by design. The meeting just
 * quietly stays in the tenant's Zoom account forever. Worth checking once after the
 * first real cancellation rather than discovering it as clutter months later.
 */
export const ZOOM_SCOPES = ["meeting:write:meeting", "meeting:delete:meeting"] as const;

export interface ZoomApp {
  clientId: string;
  clientSecret: string;
}

/** The platform's Zoom app, or null until the owner has set one up. */
export async function resolveZoomApp(): Promise<ZoomApp | null> {
  const row = await prisma.appSetting
    .findUnique({
      where: appSettingWhere(null) as Prisma.AppSettingWhereUniqueInput,
      select: { zoomClientId: true, zoomClientSecretEnc: true },
    })
    .catch(() => null);
  const clientId = row?.zoomClientId?.trim();
  const secret = row?.zoomClientSecretEnc
    ? decryptWithSecret(row.zoomClientSecretEnc, env.BETTER_AUTH_SECRET)
    : null;
  if (!clientId || !secret) return null;
  return { clientId, clientSecret: secret };
}

/** Always the PLATFORM origin: Zoom matches the redirect exactly, and no registered
 *  list can hold every customer domain. Same constraint as Google. */
export function zoomRedirectUri(): string {
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/zoom/callback`;
}

export function zoomConsentUrl(app: ZoomApp, state: string): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", app.clientId);
  u.searchParams.set("redirect_uri", zoomRedirectUri());
  u.searchParams.set("state", state);
  return u.toString();
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  reason?: string;
}

/** Zoom authenticates the token endpoint with HTTP Basic, not a body parameter. */
function basic(app: ZoomApp): string {
  return Buffer.from(`${app.clientId}:${app.clientSecret}`, "utf8").toString("base64");
}

async function postToken(app: ZoomApp, body: Record<string, string>): Promise<TokenResponse | { error: string }> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic(app)}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => null)) as TokenResponse | null;
    if (!res.ok || !json?.access_token) {
      return { error: json?.reason ?? json?.error ?? `Zoom returned ${res.status}` };
    }
    return json;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Swap the one-time code for tokens and record whose account consented. */
export async function connectZoom(tenantId: string, code: string): Promise<{ ok: true } | { error: string }> {
  const app = await resolveZoomApp();
  if (!app) return { error: "The platform's Zoom app is not configured." };

  const token = await postToken(app, {
    grant_type: "authorization_code",
    code,
    redirect_uri: zoomRedirectUri(),
  });
  if ("error" in token && token.error) return { error: token.error };
  const t = token as TokenResponse;

  let zoomEmail: string | null = null;
  let zoomUserId: string | null = null;
  try {
    const res = await fetch(`${API}/users/me`, {
      headers: { Authorization: `Bearer ${t.access_token}` },
      signal: AbortSignal.timeout(8_000),
    });
    const me = (await res.json().catch(() => null)) as { email?: string; id?: string } | null;
    zoomEmail = me?.email ?? null;
    zoomUserId = me?.id ?? null;
  } catch {
    // Cosmetic: the connection works without knowing the address.
  }

  const enc = (v: string) => encryptWithSecret(v, env.BETTER_AUTH_SECRET);
  const data = {
    zoomEmail,
    zoomUserId,
    accessTokenEnc: enc(t.access_token as string),
    refreshTokenEnc: t.refresh_token ? enc(t.refresh_token) : null,
    expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000),
    scope: t.scope ?? null,
    lastError: null,
  };
  await prisma.zoomAccount.upsert({
    where: { tenantId },
    update: data,
    create: { tenantId, ...data, connectedAt: new Date() },
  });
  return { ok: true };
}

/**
 * A usable access token, refreshing when it is nearly out.
 *
 * 🔴 ZOOM ROTATES THE REFRESH TOKEN. Every refresh returns a NEW refresh token and
 * invalidates the one just used, so the new one MUST be stored. Keeping only the
 * original works for an hour and then fails forever, and the failure looks like a
 * revoked connection rather than a bug of ours. This is the single most common way a
 * Zoom integration dies quietly.
 */
export async function zoomAccessToken(tenantId: string): Promise<string | null> {
  const row = await prisma.zoomAccount.findUnique({ where: { tenantId } }).catch(() => null);
  if (!row) return null;

  const current = row.accessTokenEnc ? decryptWithSecret(row.accessTokenEnc, env.BETTER_AUTH_SECRET) : null;
  if (current && row.expiresAt && row.expiresAt.getTime() > Date.now() + 60_000) return current;

  const refresh = row.refreshTokenEnc ? decryptWithSecret(row.refreshTokenEnc, env.BETTER_AUTH_SECRET) : null;
  if (!refresh) {
    await noteError(tenantId, "No refresh token. Disconnect Zoom and connect it again.");
    return null;
  }
  const app = await resolveZoomApp();
  if (!app) {
    await noteError(tenantId, "The platform's Zoom app is not configured.");
    return null;
  }

  const token = await postToken(app, { grant_type: "refresh_token", refresh_token: refresh });
  if ("error" in token && token.error) {
    await noteError(tenantId, `Zoom refused to renew access: ${token.error}`);
    return null;
  }
  const t = token as TokenResponse;
  const enc = (v: string) => encryptWithSecret(v, env.BETTER_AUTH_SECRET);
  await prisma.zoomAccount
    .update({
      where: { tenantId },
      data: {
        accessTokenEnc: enc(t.access_token as string),
        // The rotation, written down. See the note above.
        ...(t.refresh_token ? { refreshTokenEnc: enc(t.refresh_token) } : {}),
        expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000),
        lastError: null,
      },
    })
    .catch(() => {});
  return t.access_token ?? null;
}

async function noteError(tenantId: string, message: string): Promise<void> {
  await prisma.zoomAccount
    .updateMany({ where: { tenantId }, data: { lastError: message.slice(0, 300) } })
    .catch(() => {});
}
