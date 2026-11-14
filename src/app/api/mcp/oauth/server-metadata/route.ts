import { CORS_HEADERS, jsonResponse, originOf } from "@/mcp/oauth/core";

/**
 * RFC 8414 authorization server metadata, served at /.well-known/oauth-authorization-server
 * (next.config rewrites). The sign-in page is /mcp/connect, where the person pastes their key.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = originOf(req);
  return jsonResponse({
    issuer: origin,
    authorization_endpoint: `${origin}/mcp/connect`,
    token_endpoint: `${origin}/api/mcp/oauth/token`,
    registration_endpoint: `${origin}/api/mcp/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
