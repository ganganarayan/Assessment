import "server-only";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";
import { encryptWithSecret, decryptWithSecret } from "@/lib/crypto";
import { effectiveHost } from "@/lib/tenant/forwarded-host";

/**
 * Two-step connection: OAuth 2.1 for MCP, with the workspace's MCP key as the credential.
 *
 *   Step 1. The person adds the server by URL alone. No key in any command.
 *   Step 2. Claude finds this server's sign-in through the standard discovery documents,
 *           opens /mcp/connect in the browser, the person pastes their MCP key there, and
 *           Claude receives and stores it itself (as the OAuth access token).
 *
 * STATELESS ON PURPOSE, so there is no new table and no migration:
 *  - a client id is the client's own registration (redirect uris, name), HMAC-signed
 *  - an authorization code is the key plus the PKCE challenge, redirect uri and client,
 *    AES-GCM encrypted, valid for 5 minutes, bound by PKCE so a stolen code is useless
 *    without the verifier only the requesting client holds
 *  - the access token IS the MCP key, so the existing bearer check, revocation, plan and
 *    reach rules apply unchanged. Revoke the key and the connection stops.
 */

const CODE_TTL_MS = 5 * 60 * 1000;
const clientSecret = () => `assess360-mcp-client:${env.BETTER_AUTH_SECRET}`;
const codeSecret = () => `assess360-mcp-code:${env.BETTER_AUTH_SECRET}`;

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64url = (s: string) => Buffer.from(s, "base64url").toString("utf8");

/** This server's public origin for the request (custom domains included). */
export function originOf(req: Request): string {
  const host = effectiveHost(req.headers) || new URL(req.url).host;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  return `${local ? "http" : "https"}://${host}`;
}

export function resourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource`;
}

/** https anywhere, or http on loopback only (desktop clients listen on localhost). */
export function isAllowedRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

export interface ClientRegistration {
  redirect_uris: string[];
  client_name: string;
}

export function issueClientId(reg: ClientRegistration): string {
  const body = b64url(JSON.stringify({ r: reg.redirect_uris, n: reg.client_name.slice(0, 80) }));
  const sig = createHmac("sha256", clientSecret()).update(body).digest("base64url");
  return `a360c_${body}.${sig}`;
}

export function readClientId(clientId: string | null | undefined): ClientRegistration | null {
  if (!clientId?.startsWith("a360c_")) return null;
  const [body, sig] = clientId.slice(6).split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(createHmac("sha256", clientSecret()).update(body).digest("base64url"));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const j = JSON.parse(unb64url(body)) as { r?: unknown; n?: unknown };
    if (!Array.isArray(j.r) || !j.r.every((x) => typeof x === "string")) return null;
    return { redirect_uris: j.r as string[], client_name: typeof j.n === "string" ? j.n : "MCP client" };
  } catch {
    return null;
  }
}

/** The authorize request, validated. Anything wrong here must NOT be redirected to. */
export interface AuthorizeRequest {
  clientId: string;
  clientName: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope: string;
  resource: string;
}

export type AuthorizeCheck = { ok: true; req: AuthorizeRequest } | { ok: false; error: string };

export function checkAuthorizeParams(get: (k: string) => string | null | undefined): AuthorizeCheck {
  const clientId = get("client_id") ?? "";
  const client = readClientId(clientId);
  if (!client) return { ok: false, error: "This connection request is not from a registered client. Start again from Claude." };
  const redirectUri = get("redirect_uri") ?? "";
  if (!client.redirect_uris.includes(redirectUri) || !isAllowedRedirect(redirectUri)) {
    return { ok: false, error: "This connection request has a return address that was not registered. Start again from Claude." };
  }
  if ((get("response_type") ?? "code") !== "code") return { ok: false, error: "Unsupported response type." };
  const codeChallenge = get("code_challenge") ?? "";
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge) || (get("code_challenge_method") ?? "S256") !== "S256") {
    return { ok: false, error: "This connection request is missing its PKCE challenge. Start again from Claude." };
  }
  return {
    ok: true,
    req: {
      clientId,
      clientName: client.client_name,
      redirectUri,
      state: (get("state") ?? "").slice(0, 500),
      codeChallenge,
      scope: (get("scope") ?? "mcp").slice(0, 200),
      resource: (get("resource") ?? "").slice(0, 500),
    },
  };
}

interface CodeBody {
  k: string; // the MCP key
  c: string; // PKCE challenge
  r: string; // redirect uri
  i: string; // client id digest
  e: number; // expiry, ms
}

const digest = (s: string) => createHash("sha256").update(s).digest("base64url");

export function issueCode(key: string, req: AuthorizeRequest, now = Date.now()): string {
  const body: CodeBody = { k: key, c: req.codeChallenge, r: req.redirectUri, i: digest(req.clientId), e: now + CODE_TTL_MS };
  return b64url(encryptWithSecret(JSON.stringify(body), codeSecret()));
}

export type CodeExchange = { ok: true; key: string } | { ok: false; error: string; description: string };

export function redeemCode(
  input: { code: string; codeVerifier: string; redirectUri: string; clientId: string },
  now = Date.now(),
): CodeExchange {
  const bad = (description: string): CodeExchange => ({ ok: false, error: "invalid_grant", description });
  let body: CodeBody;
  try {
    const plain = decryptWithSecret(unb64url(input.code), codeSecret());
    if (!plain) return bad("Unknown authorization code.");
    body = JSON.parse(plain) as CodeBody;
  } catch {
    return bad("Unknown authorization code.");
  }
  if (body.e < now) return bad("The authorization code has expired. Connect again.");
  if (body.r !== input.redirectUri) return bad("redirect_uri does not match.");
  if (body.i !== digest(input.clientId)) return bad("client_id does not match.");
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(input.codeVerifier) || digest(input.codeVerifier) !== body.c) {
    return bad("PKCE verification failed.");
  }
  return { ok: true, key: body.k };
}

/** The pass-through query string for the connect page, so a retry keeps the request. */
export function authorizeQuery(req: AuthorizeRequest, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: req.clientId,
    redirect_uri: req.redirectUri,
    code_challenge: req.codeChallenge,
    code_challenge_method: "S256",
    ...(req.state ? { state: req.state } : {}),
    ...(req.scope ? { scope: req.scope } : {}),
    ...(req.resource ? { resource: req.resource } : {}),
    ...extra,
  });
  return q.toString();
}

export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
  "access-control-expose-headers": "www-authenticate",
};

export function jsonResponse(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS_HEADERS, ...extra },
  });
}
