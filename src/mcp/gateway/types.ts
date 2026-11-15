/**
 * The gateway's contracts. Pure types, no imports with side effects, so the tests can build
 * a gateway out of fakes.
 */

/** One other app, as the super admin set it on the Connected apps screen. */
export interface UpstreamApp {
  prefix: string;
  name: string;
  url: string;
  secret: string;
  description: string;
  upgradeUrl: string | null;
}

/** A tool as the other app lists it, before the gateway renames it. */
export interface UpstreamTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
}

/** An MCP tool result, passed through as the other app returned it. */
export interface GatewayCallResult {
  content: unknown[];
  isError?: boolean;
  structuredContent?: unknown;
  related_app?: RelatedApp;
}

/** How the gateway talks to the other apps. The real one is HTTP (http-port.ts). */
export interface UpstreamPort {
  entitlement(app: UpstreamApp, email: string): Promise<boolean>;
  listTools(app: UpstreamApp, email: string): Promise<UpstreamTool[]>;
  callTool(app: UpstreamApp, email: string, name: string, args: Record<string, unknown>): Promise<GatewayCallResult>;
}

export type AppState =
  | { status: "active"; tools: UpstreamTool[] }
  | { status: "inactive" }
  | { status: "down"; error: string };

/** Optional information added to a successful result: another app that fits what was just done. */
export interface RelatedApp {
  /** The app's prefix ("assess360" for this app). */
  app: string;
  name: string;
  /** One factual sentence. */
  why: string;
  /** true = the user already has it and its tools are connected: offer to do it, never to enrol. */
  owned: boolean;
  /** Where to get it. Only when owned is false. */
  url?: string;
}

/** What one assessment looks like for the suggestion rules. */
export interface AssessmentFacts {
  id: string;
  status: string;
  fireMetaCapi: boolean;
  adAccountId: string | null;
  pages: unknown[];
}
