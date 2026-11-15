/**
 * Plain (non-"use server") module for API-token scope constants + shared types,
 * so both client components and the server-action file can import them. A
 * "use server" file may only export async functions, so these can't live there.
 */

/** Scopes that can be minted. Each binds a key to ONE data domain (least privilege). */
export const API_TOKEN_SCOPES = [
  { value: "meta_match", label: "Meta match (n8n CAPI lookup)" },
  { value: "gita_mentor", label: "Gita Mentor (assessment results read)" },
  { value: "mcp_read", label: "Claude (MCP), read only" },
  { value: "mcp_write", label: "Claude (MCP), read and write" },
] as const;

export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number]["value"];

export function isApiTokenScope(s: string): s is ApiTokenScope {
  return API_TOKEN_SCOPES.some((x) => x.value === s);
}

/** Endpoint path templates per scope, shown in the admin so they can be pasted
 *  into the consumer (n8n, the mentor). Kept here so a new scope documents itself. */
export const SCOPE_ENDPOINTS: Record<ApiTokenScope, { title: string; lookup: string; health: string; lookupLabel?: string }> = {
  meta_match: {
    title: "Meta match (n8n)",
    lookup: "/api/v1/meta-match?email={{email}}&phone={{phone}}",
    health: "/api/v1/meta-match/health",
  },
  gita_mentor: {
    title: "Gita Mentor",
    lookup: "/api/v1/mentor?email={{email}}",
    health: "/api/v1/mentor/health",
  },
  mcp_read: {
    title: "Claude (MCP), read only",
    lookup: "/api/mcp",
    health: "/api/mcp/health",
    lookupLabel: "Server",
  },
  mcp_write: {
    title: "Claude (MCP), read and write",
    lookup: "/api/mcp",
    health: "/api/mcp/health",
    lookupLabel: "Server",
  },
};

/** The MCP scopes. A workspace holds at most ONE active key across both. */
export const MCP_TOKEN_SCOPES: readonly ApiTokenScope[] = ["mcp_read", "mcp_write"];

/** The only MCP scope a workspace may mint: setup always writes. Read-only is the owner's. */
export const WORKSPACE_MCP_SCOPE: ApiTokenScope = "mcp_write";

export function isMcpTokenScope(s: string): boolean {
  return (MCP_TOKEN_SCOPES as readonly string[]).includes(s);
}

export interface ApiTokenRow {
  id: string;
  prefix: string;
  scope: string;
  label: string | null;
  tenantId: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}
