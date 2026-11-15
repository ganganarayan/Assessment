import type { GatewayCallResult, UpstreamApp, UpstreamPort, UpstreamTool } from "@/mcp/gateway/types";

/**
 * How the gateway talks to another app's MCP endpoint, server to server.
 *
 * Every request carries X-Service-Secret (proves it is Assess360 asking) and X-User-Email (who
 * the call is for). The other app decides what that email may see. Works with a stateless
 * server and with one that issues an Mcp-Session-Id, and reads both JSON and SSE replies.
 */

const PROTOCOL = "2025-06-18";
const SESSION_TTL_MS = 10 * 60 * 1000;
const CALL_TIMEOUT_MS = 55_000;
const LIST_TIMEOUT_MS = 3000;

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

interface RpcMessage {
  id?: string | number | null;
  result?: unknown;
  error?: { code?: number; message?: string };
}

/** The JSON-RPC message with this id out of an SSE body (or the last one if none matches). */
export function parseSse(body: string, id: string | number): RpcMessage | null {
  let last: RpcMessage | null = null;
  for (const block of body.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    try {
      const msg = JSON.parse(data) as RpcMessage;
      if (msg && msg.id === id) return msg;
      if (msg && ("result" in msg || "error" in msg)) last = msg;
    } catch {
      // a non-JSON event (comment, ping): skip it
    }
  }
  return last;
}

/** true when get_entitlement says the user is active. Reads structuredContent or the first text block. */
export function readEntitlement(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const r = result as { isError?: boolean; structuredContent?: unknown; content?: unknown[] };
  if (r.isError) return false;
  const candidates: unknown[] = [r.structuredContent];
  const first = Array.isArray(r.content) ? r.content.find((c) => (c as { type?: unknown })?.type === "text") : undefined;
  if (first) {
    try {
      candidates.push(JSON.parse(String((first as { text?: unknown }).text ?? "")));
    } catch {
      // not JSON: no answer from this block
    }
  }
  return candidates.some((c) => {
    if (!c || typeof c !== "object") return false;
    const o = c as Record<string, unknown>;
    return o.active === true || o.entitled === true || (typeof o.status === "string" && o.status.toLowerCase() === "active");
  });
}

export function createHttpPort(fetchImpl: FetchLike = (u, i) => fetch(u, i)): UpstreamPort {
  const sessions = new Map<string, { id: string | null; at: number }>();
  let seq = 0;

  async function post(app: UpstreamApp, email: string, body: { id?: number | string; method: string }, sessionId: string | null, signal: AbortSignal) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL,
      "x-service-secret": app.secret,
      "x-user-email": email,
    };
    if (sessionId) headers["mcp-session-id"] = sessionId;
    const res = await fetchImpl(app.url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", ...body }), signal });
    const sid = res.headers.get("mcp-session-id");
    if (res.status === 202 || body.id === undefined) return { status: res.status, sessionId: sid, message: null };
    const raw = await res.text();
    if (res.status >= 400) return { status: res.status, sessionId: sid, message: null };
    const ctype = res.headers.get("content-type") ?? "";
    const message = ctype.includes("text/event-stream") ? parseSse(raw, body.id) : raw ? (JSON.parse(raw) as RpcMessage) : null;
    return { status: res.status, sessionId: sid, message };
  }

  async function rpc(app: UpstreamApp, email: string, method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const signal = AbortSignal.timeout(timeoutMs);
    const key = `${app.prefix}|${app.url}|${email.toLowerCase()}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      let s = sessions.get(key);
      if (s && Date.now() - s.at > SESSION_TTL_MS) s = undefined;
      if (!s) {
        const init = await post(
          app,
          email,
          { id: `init-${++seq}`, method: "initialize", params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "assess360-gateway", version: "1" } } } as {
            id: string;
            method: string;
          },
          null,
          signal,
        );
        if (init.status >= 400) throw new Error(`${app.name} answered HTTP ${init.status}`);
        s = { id: init.sessionId, at: Date.now() };
        sessions.set(key, s);
        await post(app, email, { method: "notifications/initialized" }, s.id, signal).catch(() => null);
      }
      const id = ++seq;
      const r = await post(app, email, { id, method, params } as { id: number; method: string }, s.id, signal);
      if (r.status === 404 && s.id && attempt === 0) {
        sessions.delete(key); // the app forgot the session: start a new one once
        continue;
      }
      if (r.status >= 400) throw new Error(`${app.name} answered HTTP ${r.status}`);
      if (!r.message) throw new Error(`${app.name} sent no answer`);
      if (r.message.error) throw new Error(r.message.error.message ?? `${app.name} returned an error`);
      return r.message.result;
    }
    throw new Error(`${app.name} kept rejecting the session`);
  }

  return {
    async entitlement(app, email) {
      return readEntitlement(await rpc(app, email, "tools/call", { name: "get_entitlement", arguments: {} }, LIST_TIMEOUT_MS));
    },
    async listTools(app, email) {
      const out: UpstreamTool[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 3; page++) {
        const res = (await rpc(app, email, "tools/list", cursor ? { cursor } : {}, LIST_TIMEOUT_MS)) as { tools?: UpstreamTool[]; nextCursor?: string } | null;
        out.push(...(res?.tools ?? []).filter((t) => t && typeof t.name === "string"));
        cursor = res?.nextCursor;
        if (!cursor) break;
      }
      return out;
    },
    async callTool(app, email, name, args) {
      const res = (await rpc(app, email, "tools/call", { name, arguments: args }, CALL_TIMEOUT_MS)) as Partial<GatewayCallResult> | null;
      return {
        content: Array.isArray(res?.content) ? res.content : [],
        ...(res?.isError ? { isError: true } : {}),
        ...(res?.structuredContent !== undefined ? { structuredContent: res.structuredContent } : {}),
      };
    },
  };
}
