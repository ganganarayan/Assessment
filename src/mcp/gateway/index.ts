import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { decryptWithSecret } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { callTool as assessCall, listTools as assessList } from "@/mcp/core/registry";
import { createGateway } from "@/mcp/gateway/core";
import { EntitlementCache } from "@/mcp/gateway/entitlements";
import { createHttpPort } from "@/mcp/gateway/http-port";
import type { AssessmentFacts, UpstreamApp } from "@/mcp/gateway/types";

/**
 * The real gateway: connected apps from the database (super admin, Connected apps), HTTP to
 * each app, dismissals in McpSuggestionDismissal. protocol.ts calls this instead of the
 * Assess360 registry directly; with no app connected it is the Assess360 tools plus two.
 */

const APPS_TTL_MS = 60_000;
let appsCache: { at: number; apps: UpstreamApp[] } | null = null;

export async function connectedApps(): Promise<UpstreamApp[]> {
  if (appsCache && Date.now() - appsCache.at < APPS_TTL_MS) return appsCache.apps;
  const rows = await prisma.mcpUpstreamApp.findMany({ where: { enabled: true, url: { not: null } }, orderBy: [{ sortOrder: "asc" }, { prefix: "asc" }] });
  const apps = rows.flatMap((r): UpstreamApp[] =>
    r.url
      ? [
          {
            prefix: r.prefix,
            name: r.name,
            url: r.url,
            secret: r.secretEnc ? (decryptWithSecret(r.secretEnc, env.BETTER_AUTH_SECRET) ?? "") : "",
            description: r.description,
            upgradeUrl: r.upgradeUrl,
          },
        ]
      : [],
  );
  appsCache = { at: Date.now(), apps };
  return apps;
}

/** After the super admin saves an app, so the next call sees it at once. */
export function forgetConnectedApps() {
  appsCache = null;
}

const port = createHttpPort();
export const entitlementCache = new EntitlementCache(port);

async function assessmentFacts(ids: string[]): Promise<AssessmentFacts[]> {
  const rows = await prisma.assessment.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, fireMetaCapi: true, adAccountId: true, publishedPages: true, resultPagePublished: true },
    take: 5,
  });
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    fireMetaCapi: r.fireMetaCapi,
    adAccountId: r.adAccountId,
    pages: [r.publishedPages, r.resultPagePublished].filter((p) => p !== null),
  }));
}

export const gateway = createGateway({
  apps: connectedApps,
  cache: entitlementCache,
  port,
  assess: { list: assessList, call: assessCall },
  assessmentFacts,
  dismissed: async (userId, now) => {
    const rows = await prisma.mcpSuggestionDismissal.findMany({ where: { userId, until: { gt: now } }, select: { app: true } });
    return new Set(rows.map((r) => r.app));
  },
  dismiss: async (userId, app, until) => {
    await prisma.mcpSuggestionDismissal.upsert({ where: { userId_app: { userId, app } }, create: { userId, app, until }, update: { until } });
  },
  allow: (key) => rateLimit(key, 120) && rateLimit("mcp:global", 3000),
});
