import { handleMcpPost } from "@/mcp/core/protocol";
import { CORS_HEADERS } from "@/mcp/oauth/core";

/**
 * The MCP endpoint: Streamable HTTP, stateless. POST /api/mcp with
 * Authorization: Bearer <MCP key>. All logic lives in src/mcp; this file only adapts.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Some builder actions (template import, AI generation) run long.
export const maxDuration = 120;

const version = () => process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";

export async function POST(req: Request) {
  return handleMcpPost(req, version());
}

/** No server-initiated stream: this server answers every request inline. */
export async function GET() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}

/** Browser-based clients (claude.ai) preflight the endpoint. */
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
