import { CORS_HEADERS, jsonResponse, redeemCode } from "@/mcp/oauth/core";

/**
 * Token endpoint: one-time code plus PKCE verifier in, the MCP key out as the access token.
 * Claude stores it; nothing is typed into any command. No expiry: the key lasts until it is
 * revoked under API tokens, which ends the connection at once.
 */
export const dynamic = "force-dynamic";

async function params(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(j).filter((e): e is [string, string] => typeof e[1] === "string"));
  }
  return new URLSearchParams(await req.text());
}

export async function POST(req: Request) {
  const p = await params(req);
  if (p.get("grant_type") !== "authorization_code") {
    return jsonResponse({ error: "unsupported_grant_type", error_description: "Only authorization_code is supported." }, 400);
  }
  const out = redeemCode({
    code: p.get("code") ?? "",
    codeVerifier: p.get("code_verifier") ?? "",
    redirectUri: p.get("redirect_uri") ?? "",
    clientId: p.get("client_id") ?? "",
  });
  if (!out.ok) return jsonResponse({ error: out.error, error_description: out.description }, 400);
  return jsonResponse({ access_token: out.key, token_type: "Bearer", scope: "mcp" });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
