/**
 * Plain (non-"use server") module for API-token scope constants + shared types,
 * so both client components and the server-action file can import them. A
 * "use server" file may only export async functions, so these can't live there.
 */

/** Scopes that can be minted. Each binds a key to ONE data domain (least privilege). */
export const API_TOKEN_SCOPES = [
  { value: "meta_match", label: "Meta match (n8n CAPI lookup)" },
] as const;

export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number]["value"];

export function isApiTokenScope(s: string): s is ApiTokenScope {
  return API_TOKEN_SCOPES.some((x) => x.value === s);
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
