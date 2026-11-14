import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { currentMcpActor, type McpActor } from "@/lib/auth/mcp-actor";

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

/**
 * The session an MCP call runs under: the token's own login, built from the user row the
 * MCP route read fresh from the database. Never persisted, never a cookie.
 */
function mcpSession(actor: McpActor): SessionResult {
  const now = new Date();
  const session = {
    id: `mcp_${actor.tokenId}`,
    token: `mcp_${actor.tokenId}`,
    userId: actor.user.id,
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
    ipAddress: null,
    userAgent: "assess360-mcp",
  };
  return { session, user: { ...actor.user } } as unknown as SessionResult;
}

/** Get the current session on the server (or null if signed out). */
export async function getSession() {
  // An MCP tool call: the verified token's login (see lib/auth/mcp-actor.ts).
  const actor = currentMcpActor();
  if (actor) return mcpSession(actor);
  return auth.api.getSession({ headers: await headers() });
}

/** Get the current user, or null. */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}
