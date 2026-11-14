import { CORS_HEADERS, isAllowedRedirect, issueClientId, jsonResponse } from "@/mcp/oauth/core";

/**
 * RFC 7591 dynamic client registration. Stateless: the client id carries the registration,
 * signed, so nothing is stored. Public clients only (PKCE, no secret).
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { redirect_uris?: unknown; client_name?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonResponse({ error: "invalid_client_metadata", error_description: "Body must be JSON." }, 400);
  }
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (uris.length === 0 || uris.length > 10 || !uris.every(isAllowedRedirect)) {
    return jsonResponse(
      { error: "invalid_redirect_uri", error_description: "redirect_uris must be https, or http on localhost." },
      400,
    );
  }
  const clientName = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim() : "MCP client";
  const clientId = issueClientId({ redirect_uris: uris, client_name: clientName });
  return jsonResponse(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName,
      redirect_uris: uris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    201,
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
