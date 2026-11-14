import { CORS_HEADERS, jsonResponse, originOf } from "@/mcp/oauth/core";

/**
 * RFC 9728 protected resource metadata, served at /.well-known/oauth-protected-resource
 * (next.config rewrites). Tells Claude where to sign in for /api/mcp.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = originOf(req);
  return jsonResponse({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
    resource_name: "Assess360",
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
