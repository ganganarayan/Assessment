/**
 * IndexNow, the pure half: which URLs to send and how to batch them. No database, no
 * network, so the verify script and the unit test exercise the same rules the submitter runs.
 */

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
/** The protocol allows 10,000 per POST; smaller batches keep one bad URL from sinking many. */
export const INDEXNOW_BATCH = 500;

export interface PublicUrl {
  url: string;
  /** YYYY-MM-DD the content last changed. */
  lastmod: string;
}

export interface HostUrls {
  /** e.g. assess360.divineleads.guru */
  host: string;
  /** e.g. https://assess360.divineleads.guru */
  origin: string;
  urls: PublicUrl[];
}

/** URLs that are new, or whose lastmod differs from the one last sent. `force` sends all. */
export function urlsToSend(current: PublicUrl[], sent: Map<string, string>, force = false): PublicUrl[] {
  const seen = new Set<string>();
  const out: PublicUrl[] = [];
  for (const u of current) {
    if (seen.has(u.url)) continue;
    seen.add(u.url);
    if (force || sent.get(u.url) !== u.lastmod) out.push(u);
  }
  return out;
}

export function batches<T>(items: T[], size = INDEXNOW_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The POST body. keyLocation sits at the host root, so it covers every URL on the host. */
export function indexNowBody(target: Pick<HostUrls, "host" | "origin">, key: string, urls: PublicUrl[]) {
  return {
    host: target.host,
    key,
    keyLocation: `${target.origin}/indexnow.txt`,
    urlList: urls.map((u) => u.url),
  };
}

/** 200 = accepted, 202 = accepted and the key is still being checked. Anything else failed. */
export function isAccepted(status: number): boolean {
  return status === 200 || status === 202;
}
