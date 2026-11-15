import "server-only";
import { z } from "zod";
import { runAsMcpActor } from "@/lib/auth/mcp-actor";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { resolveCallWorkspace } from "@/mcp/core/auth";
import { checkPreviewToken, issuePreviewToken } from "@/mcp/core/confirm";
import { toJsonSchema, type JsonSchema } from "@/mcp/core/json-schema";
import { chatJson } from "@/mcp/core/output";
import { readOnlyMessage } from "@/mcp/core/key-page";
import { ToolError, type McpIdentity, type ToolDef } from "@/mcp/core/types";
import { TOOLS } from "@/mcp/tools";

/**
 * The tool list and the one way a tool is called. A future gateway imports this file.
 *
 * Every call goes: rate limit, workspace resolution (reach check), input validation, then
 * for a write the preview/confirm rule, then the tool runs INSIDE the MCP actor context so
 * the app's own guards see the key's login and the chosen workspace.
 */

export interface McpToolListing {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint?: boolean };
}

export interface McpCallResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

const WORKSPACE_PROP: JsonSchema = {
  type: "string",
  description:
    "Optional. The workspace (tenant) id to act on, from list_workspaces. Omit for this key's own workspace. Agency keys reach their client workspaces; the owner's key reaches every workspace.",
};

function listingOf(t: ToolDef): McpToolListing {
  const base = toJsonSchema(t.input);
  const properties = { ...((base.properties as Record<string, JsonSchema> | undefined) ?? {}) };
  if (!t.crossWorkspace) properties.workspace_id = WORKSPACE_PROP;
  if (t.access === "write") {
    properties.confirm = {
      type: "boolean",
      default: false,
      description: "false (default) = preview only, nothing changes. true = do it; also send the preview_token the preview returned.",
    };
    properties.preview_token = { type: "string", description: "The preview_token from this tool's preview call. Required with confirm=true." };
  }
  const description =
    t.access === "write"
      ? `${t.description}\n\nWRITE${t.destructive ? " (destructive)" : ""}: call once without confirm to preview, show the preview to the user, then call again with confirm=true and the preview_token.`
      : t.description;
  return {
    name: t.name,
    title: t.title,
    description,
    inputSchema: { ...base, type: "object", properties },
    annotations: { readOnlyHint: t.access === "read", destructiveHint: !!t.destructive },
  };
}

export function listTools(identity: McpIdentity): McpToolListing[] {
  return TOOLS.filter((t) => t.access === "read" || identity.scope === "mcp_write").map(listingOf);
}

function textResult(v: unknown, isError = false): McpCallResult {
  return { content: [{ type: "text", text: typeof v === "string" ? v : chatJson(v) }], ...(isError ? { isError: true } : {}) };
}

/** Next.js control-flow errors thrown by redirect() / notFound() inside a guard or action. */
function nextControlFlow(e: unknown): string | null {
  const digest = typeof e === "object" && e !== null && "digest" in e ? String((e as { digest: unknown }).digest) : "";
  if (digest.startsWith("NEXT_REDIRECT")) {
    const to = digest.split(";")[2] ?? "";
    if (to.includes("workspace-unavailable")) return "That workspace is unavailable (suspended or deleted).";
    if (to.includes("change-password")) return "This login must change its password in the app before the key can be used.";
    if (to.includes("sign-in")) return "The key's login is no longer valid. Mint a new key.";
    if (to.startsWith("/w") || to.startsWith("/admin") || to.startsWith("/dashboard") || to.startsWith("/platform")) {
      return "That is not available to this key's login or workspace.";
    }
    return `The app redirected (${to || "unknown"}) instead of answering, so nothing was returned.`;
  }
  if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND") return "Not found in this workspace.";
  return null;
}

async function audit(identity: McpIdentity, workspaceId: string, tool: string, args: unknown, ok: boolean, note?: string) {
  await prisma.auditLog
    .create({
      data: {
        actorId: identity.user.id,
        actorEmail: identity.user.email,
        action: "mcp.write",
        tenantId: workspaceId,
        targetType: "mcp_tool",
        targetId: tool,
        summary: `${ok ? "Ran" : "Failed"} ${tool} through Claude (MCP key ${identity.tokenPrefix})${note ? `: ${note.slice(0, 200)}` : ""}`,
        detail: { args: JSON.parse(JSON.stringify(args ?? null)) as object, tokenId: identity.tokenId },
      },
    })
    .catch((e: unknown) => console.error("[mcp] audit write failed:", e instanceof Error ? e.message : String(e)));
}

const META_KEYS = ["workspace_id", "confirm", "preview_token"] as const;

export async function callTool(identity: McpIdentity, name: string, rawArgs: unknown): Promise<McpCallResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return textResult(`Unknown tool: ${name}. Call tools/list for the tools this key can use.`, true);
  if (tool.access === "write" && identity.scope !== "mcp_write") {
    return textResult(readOnlyMessage(identity), true);
  }
  if (!rateLimit(`mcp:${identity.tokenId}`, 120) || !rateLimit("mcp:global", 3000)) {
    return textResult("Too many calls in the last minute. Wait a moment and try again.", true);
  }

  const args = (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? rawArgs : {}) as Record<string, unknown>;
  const meta = { workspace_id: args.workspace_id, confirm: args.confirm, preview_token: args.preview_token };
  const input: Record<string, unknown> = { ...args };
  for (const k of META_KEYS) delete input[k];

  const metaParsed = z
    .object({ workspace_id: z.string().max(64).optional(), confirm: z.boolean().optional(), preview_token: z.string().max(200).optional() })
    .safeParse(meta);
  if (!metaParsed.success) return textResult(`Invalid arguments: ${metaParsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, true);

  const parsed = tool.input.safeParse(input);
  if (!parsed.success) {
    return textResult(`Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`, true);
  }

  let workspaceId = identity.homeTenantId;
  try {
    const { workspace, actor } = await resolveCallWorkspace(identity, tool.crossWorkspace ? undefined : metaParsed.data.workspace_id);
    workspaceId = workspace.id;
    const ctx = { identity, actor, workspace };

    if (tool.access === "write") {
      const binding = { tokenId: identity.tokenId, tool: tool.name, workspaceId: workspace.id, args: parsed.data };
      if (!metaParsed.data.confirm) {
        const preview = await runAsMcpActor(actor, () => (tool.preview ? tool.preview(ctx, parsed.data) : Promise.resolve({ will_run: tool.name, with: parsed.data })));
        const { token, expiresAt } = issuePreviewToken(binding);
        return textResult({
          preview: true,
          nothing_changed: true,
          workspace: { id: workspace.id, name: workspace.name },
          tool: tool.name,
          destructive: !!tool.destructive,
          what_will_happen: preview,
          to_confirm: "Show this to the user. If they agree, call the same tool again with the same arguments plus confirm=true and this preview_token.",
          expires: expiresAt,
          preview_token: token,
        });
      }
      const check = checkPreviewToken(binding, metaParsed.data.preview_token);
      if (!check.ok) return textResult(check.error, true);
      const out = await runAsMcpActor(actor, () => tool.run(ctx, parsed.data));
      await audit(identity, workspace.id, tool.name, parsed.data, true);
      return textResult({ done: true, workspace: { id: workspace.id, name: workspace.name }, result: out });
    }

    const out = await runAsMcpActor(actor, () => tool.run(ctx, parsed.data));
    return textResult(out);
  } catch (e) {
    const flow = nextControlFlow(e);
    const message = flow ?? (e instanceof ToolError ? e.message : null);
    if (tool.access === "write" && metaParsed.data.confirm) await audit(identity, workspaceId, tool.name, parsed.data, false, message ?? "error");
    if (message) return textResult(message, true);
    console.error(`[mcp] ${tool.name} failed:`, e);
    return textResult("Something went wrong running that tool. Nothing about the error is shown here; it is in the server log.", true);
  }
}
