import { handleMcpPost } from "@/mcp/core/protocol";

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

export async function DELETE() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
