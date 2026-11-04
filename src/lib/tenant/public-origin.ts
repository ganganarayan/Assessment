import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { answersAsThisApp, chooseHomeHost } from "@/lib/tenant/public-host-rule";
import { isBusinessTenant } from "@/lib/tenant/platform-tenant";

/**
 * A TENANT'S PUBLIC HOME: the one address its respondent-facing links are built on.
 *
 * Payment returns, result links, CRM payloads, booking links, click tracking and the
 * stop link all ask this one question, so a respondent who started on a tenant's domain
 * stays on it. A tenant with no working domain gets the platform's address, exactly as
 * before.
 *
 * 🔴 WHY THIS ASKS THE HOST AND NOT THE TABLE. A Domain row is an intention and
 * `verified` is a certificate milestone; neither says the host answers today. On
 * 02-11-2026 assess.divineleads.guru had a row and returned Railway's "Application not
 * found", and three separate link builders named it anyway. Railway's routed list
 * cannot settle it either, because a Cloudflare for SaaS hostname is deliberately
 * unknown to Railway. So the host is called, and it has to answer AS THIS APP: a
 * rewritten request can return a healthy 200 from the wrong app.
 *
 * 🟢 THE FAILURE DIRECTION IS SAFE. A failed check names the platform address, and the
 * platform host always serves result pages, pay links and the stop page, so a blip costs
 * one off-brand link rather than a dead one.
 *
 * Not `server-only`: the automation, webhook and abandoned-lead crons run under plain
 * Node, and importing that package there throws.
 */

const LIVE_TTL_MS = 5 * 60_000;
/** Only ever waited on the first time a host is asked about in a process. */
const PROBE_TIMEOUT_MS = 3_000;

const liveness = new Map<string, { live: boolean; at: number }>();
const inFlight = new Map<string, Promise<boolean>>();

async function probe(host: string): Promise<boolean> {
  try {
    const res = await fetch(`https://${host}/api/version`, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return res.ok && answersAsThisApp(await res.json());
  } catch {
    return false;
  }
}

function refresh(host: string): Promise<boolean> {
  const running = inFlight.get(host);
  if (running) return running;
  const started = probe(host)
    .then((live) => {
      liveness.set(host, { live, at: Date.now() });
      return live;
    })
    .finally(() => inFlight.delete(host));
  inFlight.set(host, started);
  return started;
}

/**
 * Answer from memory whenever there is one, and refresh behind it once it goes stale, so
 * a funnel page or a payment return never waits on this after the first ask.
 */
async function isLive(host: string): Promise<boolean> {
  const known = liveness.get(host);
  if (!known) return refresh(host);
  if (Date.now() - known.at >= LIVE_TTL_MS) void refresh(host);
  return known.live;
}

/** The platform's own address, with no trailing slash for callers to append a path to. */
export function platformOrigin(): string {
  return env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
}

/**
 * The origin to build this tenant's respondent-facing links on: its Primary domain if
 * that is live, else its oldest live domain, else the platform address. Never throws.
 */
export async function publicOriginFor(tenantId: string | null | undefined): Promise<string> {
  if (!isBusinessTenant(tenantId)) return platformOrigin();
  try {
    const rows = await prisma.domain.findMany({
      where: { tenantId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { hostname: true },
    });
    const hosts = rows.map((r) => r.hostname);
    const answers = await Promise.all(hosts.map(isLive));
    const live = new Set(hosts.filter((_, i) => answers[i]));
    const home = chooseHomeHost(hosts, (h) => live.has(h));
    return home ? `https://${home}` : platformOrigin();
  } catch {
    return platformOrigin();
  }
}
