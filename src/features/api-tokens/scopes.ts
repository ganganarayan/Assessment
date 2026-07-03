/**
 * Plain (non-"use server") module for API-token scope constants + shared types,
 * so both client components and the server-action file can import them. A
 * "use server" file may only export async functions, so these can't live there.
 */

/** Scopes that can be minted. Each binds a key to ONE data domain (least privilege). */
export const API_TOKEN_SCOPES = [
  { value: "meta_match", label: "Meta match (n8n CAPI lookup)" },
  { value: "gita_mentor", label: "Gita Mentor (assessment results read)" },
] as const;

export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number]["value"];

export function isApiTokenScope(s: string): s is ApiTokenScope {
  return API_TOKEN_SCOPES.some((x) => x.value === s);
}

/** Endpoint path templates per scope, shown in the admin so they can be pasted
 *  into the consumer (n8n, the mentor). Kept here so a new scope documents itself. */
export const SCOPE_ENDPOINTS: Record<ApiTokenScope, { title: string; lookup: string; health: string }> = {
  meta_match: {
    title: "Meta match (n8n)",
    lookup: "/api/meta-match?email={{email}}&phone={{phone}}",
    health: "/api/meta-match/health",
  },
  gita_mentor: {
    title: "Gita Mentor",
    lookup: "/api/mentor?email={{email}}",
    health: "/api/mentor/health",
  },
};

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
