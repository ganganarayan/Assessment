import "server-only";
import { env } from "@/lib/env";
import type { McpIdentity } from "@/mcp/core/types";

/** Where this key's login mints MCP keys: the owner on the super admin screen, everyone else in their workspace. */
export function keyPageUrl(identity: McpIdentity): string {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  return `${base}${identity.isOwner ? "/admin/api-tokens" : "/w/api"}`;
}

/** The one sentence every read-only refusal uses, so Claude can repeat it to the person word for word. */
export function readOnlyMessage(identity: McpIdentity): string {
  return (
    `This key is read only, create a read-write key at ${keyPageUrl(identity)} ` +
    `(scope "Claude (MCP), read and write"). A workspace holds one MCP key, so revoke this one there first, ` +
    `then reconnect Claude with the new key.`
  );
}
