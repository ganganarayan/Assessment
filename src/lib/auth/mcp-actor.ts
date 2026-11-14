import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The MCP actor: who an MCP tool call is acting as.
 *
 * WHY THIS EXISTS. Every screen and server action in the app answers "who is this" through
 * exactly two primitives: getSession() (the login) and readActingTenant() (the workspace an
 * owner or agency admin has entered). An MCP call has no cookie, so instead of teaching four
 * hundred actions about bearer tokens, the MCP route verifies the token and then runs the
 * tool INSIDE this context. The two primitives read the context first, so every existing
 * action runs unchanged, with the same permission checks, plan caps and parked-workspace
 * locks the browser gets. Nothing is widened: a server action is already a public endpoint
 * for a signed-in user, and the MCP actor is that same user.
 *
 * 🔴 Only src/mcp may call runAsMcpActor, and only after the token is verified. A static
 * test (tests/mcp/static-scan.test.ts) fails if anything else does.
 */

export interface McpActorUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: string;
  tenantId: string | null;
  staffPermission: string | null;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface McpActor {
  /** The ApiToken row this call authenticated with. */
  tokenId: string;
  /** The login the token was minted by. The call acts as this user. */
  user: McpActorUser;
  /**
   * What readActingTenant() returns for this call: the workspace the owner or agency admin
   * is operating, exactly as if they had pressed Enter on it. null = their own home view.
   * For an agency admin it is still re-verified against the parent link by
   * enteredAgencyTenant(), so a forged value resolves to nothing.
   */
  actingTenantId: string | null;
}

const store = new AsyncLocalStorage<McpActor>();

/** The actor of the current MCP call, or undefined for every normal browser request. */
export function currentMcpActor(): McpActor | undefined {
  return store.getStore();
}

/** Run fn as the actor. Called by the MCP registry only, after token verification. */
export function runAsMcpActor<T>(actor: McpActor, fn: () => Promise<T>): Promise<T> {
  return store.run(actor, fn);
}
