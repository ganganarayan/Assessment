import { handleMcpHealth } from "@/mcp/core/protocol";

/** GET /api/mcp/health with Authorization: Bearer <MCP key>: is this key live, and what can it reach. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return handleMcpHealth(req, process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev");
}
