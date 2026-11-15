import "server-only";
import { prisma } from "@/lib/db/prisma";
import { MARKETING } from "@/lib/marketing/content";
import { publicSitemapEntries } from "@/lib/seo/sitemap-entries";
import { publicOriginFor } from "@/lib/tenant/public-origin";
import { indexNowKey } from "@/lib/indexnow/key";
import {
  INDEXNOW_ENDPOINT,
  batches,
  indexNowBody,
  isAccepted,
  urlsToSend,
  type HostUrls,
  type PublicUrl,
} from "@/lib/indexnow/plan";

/**
 * IndexNow, the side-effecting half. Sends new or changed public URLs to IndexNow, which
 * shares them with Bing, Yandex, Seznam, Naver and Yep.
 *
 * Production only: staging pages must never reach a search engine. Covers the platform's
 * own pages (the sitemap) and the published funnels of the owner's internal workspaces
 * (unlimited, e.g. Apply Gita) on their own live domains. Customer workspaces are left out
 * on purpose: submitting someone else's pages is their decision, not ours.
 */

export function isProductionRuntime(): boolean {
  return process.env.RAILWAY_ENVIRONMENT_NAME?.trim().toLowerCase() === "production";
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Every public URL this app owns, grouped by host. */
export async function collectPublicUrls(): Promise<HostUrls[]> {
  const platform = new URL(MARKETING.domain);
  const out: HostUrls[] = [
    {
      host: platform.host,
      origin: platform.origin,
      urls: publicSitemapEntries().map((e) => ({ url: `${platform.origin}${e.path}`, lastmod: e.updated })),
    },
  ];

  const internal = await prisma.tenant.findMany({
    where: { unlimited: true, deletedAt: null, status: "ACTIVE" },
    select: { id: true },
  });
  for (const t of internal) {
    const origin = await publicOriginFor(t.id);
    const host = new URL(origin).host;
    // No live domain of its own: its funnels are served on the platform host as a fallback
    // home, which is not a page we want indexed twice.
    if (host === platform.host) continue;
    const funnels = await prisma.assessment.findMany({
      where: { tenantId: t.id, status: "PUBLISHED" },
      select: { slug: true, updatedAt: true },
    });
    const urls: PublicUrl[] = funnels.map((a) => ({ url: `${origin}/a/${a.slug}`, lastmod: isoDay(a.updatedAt) }));
    const existing = out.find((h) => h.host === host);
    if (existing) existing.urls.push(...urls);
    else if (urls.length) out.push({ host, origin, urls });
  }
  return out;
}

export interface SubmitSummary {
  host: string;
  sent: number;
  status: number | null;
  note?: string;
}

/** Send what changed (or everything, with force). Safe to run on every replica at once. */
export async function submitIndexNow(opts: { force?: boolean; fetchImpl?: typeof fetch } = {}): Promise<SubmitSummary[]> {
  if (!isProductionRuntime()) return [{ host: "(all)", sent: 0, status: null, note: "Not production: nothing sent." }];
  const doFetch = opts.fetchImpl ?? fetch;
  const key = indexNowKey();
  const summaries: SubmitSummary[] = [];

  for (const target of await collectPublicUrls()) {
    const rows = await prisma.indexNowUrl.findMany({ where: { host: target.host }, select: { url: true, lastmod: true } });
    const todo = urlsToSend(target.urls, new Map(rows.map((r) => [r.url, r.lastmod])), opts.force);
    if (!todo.length) {
      summaries.push({ host: target.host, sent: 0, status: null, note: "Nothing new or changed." });
      continue;
    }
    for (const batch of batches(todo)) {
      let status = 0;
      let note: string | undefined;
      try {
        const res = await doFetch(INDEXNOW_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify(indexNowBody(target, key, batch)),
          signal: AbortSignal.timeout(15_000),
        });
        status = res.status;
        if (!isAccepted(status)) note = (await res.text().catch(() => "")).slice(0, 300) || undefined;
      } catch (e) {
        note = e instanceof Error ? e.message.slice(0, 300) : "Request failed.";
      }
      if (isAccepted(status)) {
        await prisma.$transaction(
          batch.map((u) =>
            prisma.indexNowUrl.upsert({
              where: { url: u.url },
              create: { url: u.url, host: target.host, lastmod: u.lastmod },
              update: { lastmod: u.lastmod, submittedAt: new Date() },
            }),
          ),
        );
      }
      await prisma.indexNowRun.create({ data: { host: target.host, count: batch.length, status, note: note ?? null } });
      summaries.push({ host: target.host, sent: batch.length, status, note });
    }
  }
  return summaries;
}

let started = false;

/** Called once per server start: a deploy is a start, so this is the after-deploy run. */
export function scheduleIndexNowAfterBoot(delayMs = 90_000): void {
  if (started || !isProductionRuntime()) return;
  started = true;
  const t = setTimeout(() => {
    submitIndexNow().catch((e) => console.error("[indexnow] after-boot run failed", e));
  }, delayMs);
  t.unref?.();
}
