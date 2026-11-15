import type { AppState, UpstreamApp, UpstreamPort } from "@/mcp/gateway/types";

/**
 * Who has which app, cached for 10 minutes per user per app.
 *
 * One lookup asks the app's get_entitlement and, when the user is active there, its tool list,
 * so tools/list costs nothing for the next 10 minutes. An app that is down or slower than the
 * timeout is remembered as down for one minute only, then asked again: its tools are hidden in
 * the meantime and every other app's tools still load.
 */

export const ENTITLEMENT_TTL_MS = 10 * 60 * 1000;
export const DOWN_TTL_MS = 60 * 1000;
export const LOOKUP_TIMEOUT_MS = 3000;

export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} did not answer within ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

export class EntitlementCache {
  private readonly entries = new Map<string, { at: number; ttl: number; state: AppState }>();
  private readonly inflight = new Map<string, Promise<AppState>>();

  constructor(
    private readonly port: UpstreamPort,
    private readonly timeoutMs = LOOKUP_TIMEOUT_MS,
  ) {}

  private key(app: UpstreamApp, email: string) {
    return `${app.prefix}|${app.url}|${email.trim().toLowerCase()}`;
  }

  async get(app: UpstreamApp, email: string, now: number = Date.now()): Promise<AppState> {
    const key = this.key(app, email);
    const hit = this.entries.get(key);
    if (hit && now - hit.at < hit.ttl) return hit.state;
    const running = this.inflight.get(key);
    if (running) return running;

    const load = (async (): Promise<AppState> => {
      try {
        const state = await withTimeout(
          (async (): Promise<AppState> => {
            const active = await this.port.entitlement(app, email);
            if (!active) return { status: "inactive" };
            return { status: "active", tools: await this.port.listTools(app, email) };
          })(),
          this.timeoutMs,
          app.name,
        );
        this.entries.set(key, { at: now, ttl: ENTITLEMENT_TTL_MS, state });
        return state;
      } catch (e) {
        const state: AppState = { status: "down", error: e instanceof Error ? e.message : String(e) };
        this.entries.set(key, { at: now, ttl: DOWN_TTL_MS, state });
        return state;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, load);
    return load;
  }

  /** Forget one user's answers, e.g. after they buy an app. */
  forget(email: string) {
    const e = `|${email.trim().toLowerCase()}`;
    for (const k of this.entries.keys()) if (k.endsWith(e)) this.entries.delete(k);
  }
}
