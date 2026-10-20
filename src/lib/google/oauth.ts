import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { encryptWithSecret, decryptWithSecret } from "@/lib/crypto";
import { appSettingWhere } from "@/lib/settings/tenant-row";
import type { Prisma } from "@prisma/client";

/**
 * The Google OAuth half of the calendar connection: the consent URL, the code exchange,
 * and keeping an access token alive afterwards.
 *
 * The app's OAuth client lives on the PLATFORM settings row. One Google Cloud project
 * for the whole product: a tenant clicks Connect and consents, and is never asked for a
 * client id, because they do not have one and should not need one.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

/**
 * What we ask for, and nothing more.
 *
 * calendar.events writes the bookings. calendar.readonly is what free/busy needs, so a
 * meeting already in somebody's own calendar can block a slot. We never request the
 * full `calendar` scope, which would also let us delete calendars.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

export interface GoogleOAuthApp {
  clientId: string;
  clientSecret: string;
}

/** The platform's OAuth client, or null when the owner has not set one up yet. */
export async function resolveGoogleApp(): Promise<GoogleOAuthApp | null> {
  const row = await prisma.appSetting
    .findUnique({
      where: appSettingWhere(null) as Prisma.AppSettingWhereUniqueInput,
      select: { googleClientId: true, googleClientSecretEnc: true },
    })
    .catch(() => null);
  const clientId = row?.googleClientId?.trim();
  const secret = row?.googleClientSecretEnc
    ? decryptWithSecret(row.googleClientSecretEnc, env.BETTER_AUTH_SECRET)
    : null;
  if (!clientId || !secret) return null;
  return { clientId, clientSecret: secret };
}

/**
 * The one redirect URI, always on the PLATFORM origin.
 *
 * 🔴 It cannot be the tenant's own domain, however much nicer that would read. Google
 * matches the redirect against a list registered in the Cloud console, and no list can
 * contain every customer domain that may exist tomorrow. So consent happens here and
 * the browser is sent back to wherever it started afterwards.
 */
export function googleRedirectUri(): string {
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/google/callback`;
}

/** Where to send somebody to approve the connection. */
export function consentUrl(app: GoogleOAuthApp, state: string): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", app.clientId);
  u.searchParams.set("redirect_uri", googleRedirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  // offline + consent is what yields a REFRESH token. Without both, Google returns one
  // only on the very first authorisation ever, and a reconnect silently gets none -
  // which works for an hour and then stops forever.
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function postToken(body: Record<string, string>): Promise<TokenResponse | { error: string }> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => null)) as TokenResponse | null;
    if (!res.ok || !json) {
      return { error: json?.error_description ?? json?.error ?? `Google returned ${res.status}` };
    }
    return json;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export interface ExchangedTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string | null;
  email: string | null;
}

/** Swap the one-time code for tokens, and find out whose account consented. */
export async function exchangeCode(
  app: GoogleOAuthApp,
  code: string,
): Promise<ExchangedTokens | { error: string }> {
  const token = await postToken({
    code,
    client_id: app.clientId,
    client_secret: app.clientSecret,
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
  });
  if ("error" in token && token.error) return { error: token.error };
  const t = token as TokenResponse;
  if (!t.access_token) return { error: "Google did not return an access token." };

  // Whose account it is, shown back to the owner so "connected" names something.
  let email: string | null = null;
  try {
    const res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${t.access_token}` },
      signal: AbortSignal.timeout(8_000),
    });
    const who = (await res.json().catch(() => null)) as { email?: string } | null;
    email = who?.email ?? null;
  } catch {
    // Not knowing the address is cosmetic; the connection still works.
  }

  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000),
    scope: t.scope ?? null,
    email,
  };
}

/** Store a connection, replacing whatever that calendar had before. */
export async function saveConnection(args: {
  tenantId: string;
  calendarKey: string;
  userId: string | null;
  tokens: ExchangedTokens;
}): Promise<void> {
  const enc = (v: string) => encryptWithSecret(v, env.BETTER_AUTH_SECRET);
  const base = {
    userId: args.userId,
    googleEmail: args.tokens.email,
    accessTokenEnc: enc(args.tokens.accessToken),
    expiresAt: args.tokens.expiresAt,
    scope: args.tokens.scope,
    syncEnabled: true,
    lastError: null,
  };
  await prisma.googleCalendarAccount.upsert({
    where: { tenantId_calendarKey: { tenantId: args.tenantId, calendarKey: args.calendarKey } },
    // 🟡 The refresh token is only overwritten when Google sent a new one. A re-consent
    // that returns none must not wipe the one we have, or the connection dies an hour
    // later with nothing to renew it.
    update: {
      ...base,
      ...(args.tokens.refreshToken ? { refreshTokenEnc: enc(args.tokens.refreshToken) } : {}),
    },
    create: {
      tenantId: args.tenantId,
      calendarKey: args.calendarKey,
      calendarId: "primary",
      ...base,
      refreshTokenEnc: args.tokens.refreshToken ? enc(args.tokens.refreshToken) : null,
      connectedAt: new Date(),
    },
  });
}

/**
 * A usable access token for this calendar, refreshing it when it is about to expire.
 * Null when the calendar is not connected, is paused, or the refresh was refused -
 * which is what happens when somebody revokes access from their Google account, and is
 * recorded on the row rather than thrown.
 */
export async function accessTokenFor(
  tenantId: string,
  calendarKey: string,
): Promise<{ token: string; calendarId: string } | null> {
  const row = await prisma.googleCalendarAccount
    .findUnique({ where: { tenantId_calendarKey: { tenantId, calendarKey } } })
    .catch(() => null);
  if (!row || !row.syncEnabled) return null;

  const calendarId = row.calendarId ?? "primary";
  const current = row.accessTokenEnc ? decryptWithSecret(row.accessTokenEnc, env.BETTER_AUTH_SECRET) : null;
  // A minute of slack: a token that expires mid-request is a failure nobody can explain.
  const stillGood = row.expiresAt && row.expiresAt.getTime() > Date.now() + 60_000;
  if (current && stillGood) return { token: current, calendarId };

  const refresh = row.refreshTokenEnc ? decryptWithSecret(row.refreshTokenEnc, env.BETTER_AUTH_SECRET) : null;
  if (!refresh) {
    await noteError(row.id, "No refresh token. Disconnect and connect again.");
    return null;
  }
  const app = await resolveGoogleApp();
  if (!app) {
    await noteError(row.id, "The platform's Google app is not configured.");
    return null;
  }

  const token = await postToken({
    client_id: app.clientId,
    client_secret: app.clientSecret,
    refresh_token: refresh,
    grant_type: "refresh_token",
  });
  if ("error" in token && token.error) {
    // The usual cause is the person revoking access in their Google account, and the
    // honest thing is to say so on the card rather than retry forever.
    await noteError(row.id, `Google refused to renew access: ${token.error}`);
    return null;
  }
  const t = token as TokenResponse;
  if (!t.access_token) {
    await noteError(row.id, "Google renewed nothing.");
    return null;
  }

  await prisma.googleCalendarAccount
    .update({
      where: { id: row.id },
      data: {
        accessTokenEnc: encryptWithSecret(t.access_token, env.BETTER_AUTH_SECRET),
        expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000),
        lastError: null,
      },
    })
    .catch(() => {});
  return { token: t.access_token, calendarId };
}

async function noteError(id: string, message: string): Promise<void> {
  await prisma.googleCalendarAccount
    .update({ where: { id }, data: { lastError: message.slice(0, 300) } })
    .catch(() => {});
}
