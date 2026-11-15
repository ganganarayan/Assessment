import type { McpCallResult, McpToolListing } from "@/mcp/core/registry";
import type { McpIdentity } from "@/mcp/core/types";
import type { JsonSchema } from "@/mcp/core/json-schema";
import { formatISTDate } from "@/lib/date";
import { allocate, MAX_TOOLS_SHOWN } from "@/mcp/gateway/budget";
import type { EntitlementCache } from "@/mcp/gateway/entitlements";
import {
  ASSESS360,
  DISMISS_DAYS,
  assessmentEvents,
  idsIn,
  pickSuggestion,
  upstreamEvent,
  RULES,
  type KnownApp,
  type SuggestionEvent,
} from "@/mcp/gateway/suggestions";
import type { AppState, AssessmentFacts, GatewayCallResult, UpstreamApp, UpstreamPort, UpstreamTool } from "@/mcp/gateway/types";

/**
 * The gateway: Assess360's own tools exactly as before, plus the tools of every other app the
 * signed-in user is active in, renamed with that app's prefix (router_push_recording), plus
 * list_my_apps and dismiss_suggestion.
 *
 * Built from injected parts so the tests run it against fake apps. index.ts wires the real ones.
 */

export interface GatewayDeps {
  /** Connected apps (enabled, with a URL). */
  apps: () => Promise<UpstreamApp[]>;
  cache: EntitlementCache;
  port: UpstreamPort;
  assess: {
    list: (identity: McpIdentity) => McpToolListing[];
    call: (identity: McpIdentity, name: string, args: unknown) => Promise<McpCallResult>;
  };
  assessmentFacts: (ids: string[]) => Promise<AssessmentFacts[]>;
  dismissed: (userId: string, now: Date) => Promise<Set<string>>;
  dismiss: (userId: string, app: string, until: Date) => Promise<void>;
  /** Rate limit for calls forwarded to another app. */
  allow: (key: string) => boolean;
  now?: () => number;
}

type ActiveState = Extract<AppState, { status: "active" }>;

const ASSESS360_NAME = "Assess360";
const ASSESS360_WHAT = "Qualifies leads with a gate and a scored quiz, and reports only qualified leads to Meta.";

export const GATEWAY_TOOL_NAMES = ["list_my_apps", "dismiss_suggestion"] as const;

const LIST_MY_APPS: McpToolListing = {
  name: "list_my_apps",
  title: "List my apps",
  description:
    "The apps this login has (their tools are in this list, named with the app's prefix) and the apps it does not have, each with what it does and where to get it. Call this whenever the user asks for something none of the current tools can do, or their need matches another app.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false },
};

const DISMISS: McpToolListing = {
  name: "dismiss_suggestion",
  title: "Stop suggesting an app",
  description: `Stop suggesting one app (related_app) to this user for ${DISMISS_DAYS} days. Call it when the user says they are not interested in an app that was suggested.`,
  inputSchema: {
    type: "object",
    properties: { app: { type: "string", description: "The app's name or prefix, as related_app or list_my_apps gave it." } },
    required: ["app"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
};

function text(v: unknown, isError = false): GatewayCallResult {
  return { content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }], ...(isError ? { isError: true } : {}) };
}

function allowedFor(identity: McpIdentity, t: UpstreamTool): boolean {
  return identity.scope === "mcp_write" || t.annotations?.readOnlyHint === true;
}

function listingOfUpstream(app: UpstreamApp, t: UpstreamTool): McpToolListing {
  const schema = (t.inputSchema && typeof t.inputSchema === "object" ? t.inputSchema : { type: "object" }) as JsonSchema;
  return {
    name: `${app.prefix}_${t.name}`,
    title: `${app.name}: ${t.title ?? t.name}`,
    description: `[${app.name}] ${t.description ?? t.name}`,
    inputSchema: { ...schema, type: "object" },
    annotations: {
      readOnlyHint: t.annotations?.readOnlyHint === true,
      destructiveHint: t.annotations?.destructiveHint === true,
      ...(t.annotations?.idempotentHint !== undefined ? { idempotentHint: t.annotations.idempotentHint } : {}),
    },
  };
}

export function createGateway(deps: GatewayDeps) {
  const now = () => (deps.now ? deps.now() : Date.now());
  const loadApps = () => deps.apps().catch(() => [] as UpstreamApp[]);

  async function states(identity: McpIdentity): Promise<{ app: UpstreamApp; state: AppState }[]> {
    const apps = await loadApps();
    const t = now();
    return Promise.all(apps.map(async (app) => ({ app, state: await deps.cache.get(app, identity.user.email, t) })));
  }

  async function listTools(identity: McpIdentity): Promise<McpToolListing[]> {
    const own = deps.assess.list(identity);
    const all = await states(identity);
    const active = all.filter((s): s is { app: UpstreamApp; state: ActiveState } => s.state.status === "active");
    const groups = active.map(({ app, state }) =>
      state.tools.filter((t) => t.name !== "get_entitlement" && allowedFor(identity, t)).map((t) => listingOfUpstream(app, t)),
    );
    const budget = MAX_TOOLS_SHOWN - own.length - GATEWAY_TOOL_NAMES.length;
    return [...own, LIST_MY_APPS, DISMISS, ...allocate(groups, budget).flat()];
  }

  async function knownApps(identity: McpIdentity, wanted: Set<string>): Promise<Map<string, KnownApp>> {
    const map = new Map<string, KnownApp>([[ASSESS360, { name: ASSESS360_NAME, upgradeUrl: null, state: "active" }]]);
    const apps = (await loadApps()).filter((a) => wanted.has(a.prefix));
    const t = now();
    for (const app of apps) {
      const s = await deps.cache.get(app, identity.user.email, t);
      map.set(app.prefix, { name: app.name, upgradeUrl: app.upgradeUrl, state: s.status });
    }
    return map;
  }

  /** Adds related_app to a successful result. Never throws: a suggestion is never worth a failed call. */
  async function withSuggestion(identity: McpIdentity, result: GatewayCallResult, events: SuggestionEvent[]): Promise<GatewayCallResult> {
    if (result.isError || events.length === 0) return result;
    try {
      const apps = await knownApps(identity, new Set(events.map((e) => RULES[e].app)));
      const dismissed = await deps.dismissed(identity.user.id, new Date(now()));
      const related = pickSuggestion(events, apps, dismissed);
      if (!related) return result;
      return {
        ...result,
        content: [...result.content, { type: "text", text: `related_app: ${JSON.stringify(related)}` }],
        related_app: related,
      };
    } catch {
      return result;
    }
  }

  async function listMyApps(identity: McpIdentity): Promise<GatewayCallResult> {
    const all = await states(identity);
    const have = [{ app: ASSESS360_NAME, prefix: ASSESS360, what: ASSESS360_WHAT }];
    const doNotHave: { app: string; prefix: string; what: string; get_it: string | null }[] = [];
    const notReachable: string[] = [];
    for (const { app, state } of all) {
      if (state.status === "active") have.push({ app: app.name, prefix: app.prefix, what: app.description });
      else if (state.status === "inactive") doNotHave.push({ app: app.name, prefix: app.prefix, what: app.description, get_it: app.upgradeUrl });
      else notReachable.push(app.name);
    }
    return text({
      have,
      do_not_have: doNotHave,
      ...(notReachable.length ? { not_reachable_right_now: notReachable } : {}),
      how_to_use:
        "Tools of an app the user has are in the tool list, named with its prefix. For an app they do not have, say what it does and where to get it.",
    });
  }

  async function dismissSuggestion(identity: McpIdentity, rawArgs: unknown): Promise<GatewayCallResult> {
    const raw = rawArgs && typeof rawArgs === "object" ? (rawArgs as Record<string, unknown>).app : undefined;
    const asked = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!asked) return text("Say which app: its name or prefix.", true);
    const apps = await loadApps();
    const match =
      asked === ASSESS360 || asked === ASSESS360_NAME.toLowerCase()
        ? { prefix: ASSESS360, name: ASSESS360_NAME }
        : apps.find((a) => a.prefix === asked || a.name.toLowerCase() === asked);
    if (!match) return text(`No app called ${asked}. Call list_my_apps for the names.`, true);
    const until = new Date(now() + DISMISS_DAYS * 24 * 60 * 60 * 1000);
    await deps.dismiss(identity.user.id, match.prefix, until);
    return text({ done: true, app: match.name, not_suggested_until: formatISTDate(until) });
  }

  async function callTool(identity: McpIdentity, name: string, rawArgs: unknown): Promise<GatewayCallResult> {
    if (name === "list_my_apps") return listMyApps(identity);
    if (name === "dismiss_suggestion") return dismissSuggestion(identity, rawArgs);

    const args = (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? rawArgs : {}) as Record<string, unknown>;
    const app = (await loadApps()).find((a) => name.startsWith(`${a.prefix}_`));

    if (app) {
      const toolName = name.slice(app.prefix.length + 1);
      const state = await deps.cache.get(app, identity.user.email, now());
      if (state.status === "down") return text(`${app.name} is not reachable right now. Try again in a minute.`, true);
      if (state.status === "inactive") {
        return text(`This login does not have ${app.name}.${app.upgradeUrl ? ` It is available at ${app.upgradeUrl}` : ""}`, true);
      }
      const tool = state.tools.find((t) => t.name === toolName && t.name !== "get_entitlement");
      if (!tool) return text(`Unknown tool: ${name}. Call tools/list for the tools this key can use.`, true);
      if (!allowedFor(identity, tool)) return text("This key is read-only (mcp_read), and that tool changes something.", true);
      if (!deps.allow(`mcp:${identity.tokenId}`)) return text("Too many calls in the last minute. Wait a moment and try again.", true);
      let result: GatewayCallResult;
      try {
        result = await deps.port.callTool(app, identity.user.email, toolName, args);
      } catch (e) {
        return text(`${app.name} did not complete that call: ${e instanceof Error ? e.message : String(e)}`, true);
      }
      const ev = upstreamEvent(app.prefix, toolName);
      return withSuggestion(identity, result, ev ? [ev] : []);
    }

    const result: GatewayCallResult = await deps.assess.call(identity, name, rawArgs);
    if (result.isError) return result;
    const own = deps.assess.list(identity).find((t) => t.name === name);
    if (!own) return result;
    const write = !own.annotations.readOnlyHint;
    if (write && args.confirm !== true) return result; // a preview: the task is not finished
    const ids = [...idsIn(args)];
    if (!ids.length) return result;
    const facts = await deps.assessmentFacts(ids).catch(() => [] as AssessmentFacts[]);
    return withSuggestion(identity, result, assessmentEvents(facts, write));
  }

  return { listTools, callTool };
}
