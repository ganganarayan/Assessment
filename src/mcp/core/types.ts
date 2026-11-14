import type { z } from "zod";
import type { McpActor } from "@/lib/auth/mcp-actor";
import type { Scope } from "@/lib/tenant/scope";

/**
 * The contract every MCP tool is written against. Plain functions of (context, input), so a
 * future gateway MCP can import the registry directly or forward to /api/mcp: a tool never
 * knows how it was called.
 */

export const MCP_SCOPES = ["mcp_read", "mcp_write"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export function isMcpScope(s: string): s is McpScope {
  return (MCP_SCOPES as readonly string[]).includes(s);
}

/** Who a token is, before a workspace is picked for one call. */
export interface McpIdentity {
  tokenId: string;
  tokenPrefix: string;
  tokenLabel: string | null;
  scope: McpScope;
  /** The workspace the key was minted in ("platform" for the owner's key). */
  homeTenantId: string;
  /** The platform owner: reaches every workspace, like the super-admin console. */
  isOwner: boolean;
  /** An agency account: reaches its own workspace and its client workspaces. */
  isAgency: boolean;
  user: McpActor["user"];
}

/** The workspace one call operates on, resolved and verified. */
export interface McpWorkspace {
  id: string;
  name: string;
  slug: string;
  /** The read scope for this call. Always ONE tenant, never all of them. */
  scope: Scope;
}

export interface ToolContext {
  identity: McpIdentity;
  actor: McpActor;
  workspace: McpWorkspace;
}

export type ToolAccess = "read" | "write";

export interface ToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  title: string;
  description: string;
  access: ToolAccess;
  /** Deletes, revokes or sends something that cannot be taken back. Shown in previews. */
  destructive?: boolean;
  /** Reaches across workspaces itself (list_workspaces); takes no workspace_id. */
  crossWorkspace?: boolean;
  input: S;
  /** For a write: what the confirm call will do, without doing it. */
  preview?: (ctx: ToolContext, input: z.infer<S>) => Promise<unknown>;
  run: (ctx: ToolContext, input: z.infer<S>) => Promise<unknown>;
}

/** A tool error the agent should see as a plain sentence, never a stack trace. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

/** Shape-compatible with features/assessment/actions/shared ActionResult. */
export type ActionLike = { ok: true; data?: unknown } | { ok: false; error: string };

export function isActionResult(v: unknown): v is ActionLike {
  return typeof v === "object" && v !== null && "ok" in v && typeof (v as { ok: unknown }).ok === "boolean";
}

/** Unwrap an action's { ok, data } / { ok: false, error } into data or a ToolError. */
export function unwrapAction(v: unknown): unknown {
  if (!isActionResult(v)) return v;
  if (!v.ok) throw new ToolError(v.error);
  return v.data ?? { ok: true };
}

/** Keeps a tool's input type inferred inside its own handlers, then erases it for the list. */
export function defineTool<S extends z.ZodTypeAny>(def: ToolDef<S>): ToolDef {
  return def as unknown as ToolDef;
}
