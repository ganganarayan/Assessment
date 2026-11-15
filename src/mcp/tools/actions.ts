import "server-only";
import { z } from "zod";
import { ACTION_CATALOG, ACTION_LOADERS, EXCLUDED_ACTIONS } from "@/mcp/actions/catalog.generated";
import type { CatalogEntry } from "@/mcp/actions/types";
import { readOnlyMessage } from "@/mcp/core/key-page";
import { ToolError, isActionResult, type ToolContext, type ToolDef } from "@/mcp/core/types";

/**
 * The action bridge: anything the app can do that has no typed tool.
 *
 * Each catalog entry is one of the app's own server actions. It runs as the key's login
 * inside the chosen workspace (see lib/auth/mcp-actor.ts), so it goes through the SAME
 * checks as a click in the app: workspace ownership, staff permissions, plan caps, parked
 * locks, release switches. Nothing here re-implements a rule; the action is the rule.
 *
 * Reads run straight away. Writes follow the preview then confirm rule like every write tool.
 */

function find(id: string): CatalogEntry {
  const e = ACTION_CATALOG.find((x) => x.id === id);
  if (e) return e;
  const ex = EXCLUDED_ACTIONS.find((x) => x.id === id);
  if (ex) throw new ToolError(`${id} is not available through MCP: ${ex.reason}.`);
  throw new ToolError(`No app action called ${id}. Call list_app_actions to search.`);
}

function signature(e: CatalogEntry): string {
  return `${e.fn}(${e.params.map((p) => `${p.name}${p.optional ? "?" : ""}: ${p.type}`).join(", ")}): ${e.returns}`;
}

const SHORT_TYPE = 160;
/** The listing's one-line form: long parameter types are cut, describe_app_action has them whole. */
function shortSignature(e: CatalogEntry): { text: string; cut: boolean } {
  let cut = false;
  const params = e.params.map((p) => {
    const t = p.type.length > SHORT_TYPE ? ((cut = true), `${p.type.slice(0, SHORT_TYPE)}...`) : p.type;
    return `${p.name}${p.optional ? "?" : ""}: ${t}`;
  });
  return { text: `${e.fn}(${params.join(", ")}): ${e.returns.length > SHORT_TYPE ? `${e.returns.slice(0, SHORT_TYPE)}...` : e.returns}`, cut };
}

function checkArity(e: CatalogEntry, args: unknown[]) {
  const required = e.params.filter((p) => !p.optional).length;
  if (args.length < required || args.length > e.params.length) {
    throw new ToolError(`${e.id} takes ${required === e.params.length ? required : `${required} to ${e.params.length}`} argument(s): ${signature(e)}`);
  }
}

async function invoke(e: CatalogEntry, args: unknown[]): Promise<unknown> {
  const load = ACTION_LOADERS[e.module];
  if (!load) throw new ToolError(`${e.id} could not be loaded.`);
  const mod = await load();
  const fn = mod[e.fn];
  if (typeof fn !== "function") throw new ToolError(`${e.id} could not be loaded.`);
  const out: unknown = await (fn as (...a: unknown[]) => Promise<unknown>)(...args);
  if (isActionResult(out) && !out.ok) throw new ToolError(out.error);
  return out === undefined ? { ok: true } : out;
}

const listAppActions: ToolDef = {
  name: "list_app_actions",
  title: "List app actions",
  description:
    "Search every action the app can perform (builder, settings, contacts, calendar, workflows, nurture, webhooks, result pages, domains, staff, and for the owner key the platform console). Returns ids with exact argument types to pass to run_app_action.",
  access: "read",
  input: z.object({
    search: z.string().trim().max(80).optional().describe("Words in the id, name or description, e.g. 'question', 'publish', 'tag'."),
    area: z.string().trim().max(60).optional().describe("Id prefix, e.g. 'assessment', 'contacts', 'workspace.domains'."),
    kind: z.enum(["read", "write", "all"]).default("all"),
    limit: z.number().int().min(1).max(100).default(40),
  }),
  run: async (_ctx: ToolContext, input: { search?: string; area?: string; kind: "read" | "write" | "all"; limit: number }) => {
    const words = (input.search ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const hits = ACTION_CATALOG.filter(
      (e) =>
        (input.kind === "all" || e.kind === input.kind) &&
        (!input.area || e.id.startsWith(input.area)) &&
        words.every((w) => `${e.id} ${e.doc}`.toLowerCase().includes(w)),
    );
    const areas = [...new Set(ACTION_CATALOG.map((e) => e.id.split(".").slice(0, -1).join(".")))];
    return {
      total_actions: ACTION_CATALOG.length,
      matches: hits.length,
      actions: hits.slice(0, input.limit).map((e) => ({
        id: e.id,
        kind: e.kind,
        destructive: e.destructive,
        signature: shortSignature(e).text,
        full_schema: shortSignature(e).cut ? "cut here: call describe_app_action for every field" : undefined,
        description: e.doc || null,
      })),
      more: Math.max(0, hits.length - input.limit),
      areas: input.search || input.area ? undefined : areas,
      note: "Pass args to run_app_action as a JSON array in parameter order. Ids such as assessment ids come from the typed tools (list_assessments, get_assessment).",
    };
  },
};

const describeAppAction: ToolDef = {
  name: "describe_app_action",
  title: "Describe one app action",
  description:
    "The full, untruncated argument list of one action from list_app_actions: each parameter, and for an object parameter every field with its type, whether it is optional, and its note. Call this before run_app_action whenever a signature in the listing is cut.",
  access: "read",
  input: z.object({ action: z.string().trim().min(1).max(120).describe("An id from list_app_actions.") }),
  run: async (_ctx: ToolContext, input: { action: string }) => {
    const e = find(input.action);
    return {
      id: e.id,
      kind: e.kind,
      destructive: e.destructive,
      description: e.doc || null,
      run_with: e.kind === "read" ? "run_app_action_read (or run_app_action)" : "run_app_action: preview first, then confirm=true with the preview_token",
      params: e.params.map((p, i) => ({
        position: i,
        name: p.name,
        optional: p.optional,
        type: p.fields ? undefined : p.type,
        fields: p.fields,
      })),
      returns: e.returns,
      note: "Pass args as a JSON array in position order. An object parameter is one JSON object holding the fields listed.",
    };
  },
};

const runInput = z.object({
  action: z.string().trim().min(1).max(120).describe("An id from list_app_actions."),
  args: z.array(z.unknown()).max(8).default([]).describe("Arguments in parameter order, as JSON values."),
});

/** Reads and writes share one tool name in the catalog, so the gate is per action, decided in run. */
const runAppActionRead: ToolDef = {
  name: "run_app_action_read",
  title: "Run an app read action",
  description: "Run one READ action from list_app_actions (kind=read). Nothing changes. For writes use run_app_action.",
  access: "read",
  input: runInput,
  run: async (ctx: ToolContext, input: { action: string; args: unknown[] }) => {
    const e = find(input.action);
    if (e.kind !== "read") {
      if (ctx.identity.scope !== "mcp_write") throw new ToolError(`${e.id} changes data. ${readOnlyMessage(ctx.identity)}`);
      throw new ToolError(`${e.id} changes data. Use run_app_action, which previews first.`);
    }
    checkArity(e, input.args);
    return { action: e.id, result: await invoke(e, input.args) };
  },
};

const runAppAction: ToolDef = {
  name: "run_app_action",
  title: "Run an app action",
  description:
    "Run one action from list_app_actions as this key's login inside the workspace, with the same permission, plan and workspace checks as the app. Read actions also work here.",
  access: "write",
  input: runInput,
  preview: async (ctx: ToolContext, input: { action: string; args: unknown[] }) => {
    const e = find(input.action);
    checkArity(e, input.args);
    return {
      action: e.id,
      kind: e.kind,
      destructive: e.destructive,
      in_workspace: ctx.workspace.name,
      signature: signature(e),
      args: input.args,
      what_it_does: e.doc || "No description in the source; the action name says what it does.",
      warning: e.destructive ? "This deletes, sends or changes something that may not be undoable." : undefined,
      checks: "The app's own checks run on confirm: workspace ownership, permissions, plan limits.",
    };
  },
  run: async (_ctx: ToolContext, input: { action: string; args: unknown[] }) => {
    const e = find(input.action);
    checkArity(e, input.args);
    return { action: e.id, result: await invoke(e, input.args) };
  },
};

export const ACTION_TOOLS: ToolDef[] = [listAppActions, describeAppAction, runAppActionRead, runAppAction];
