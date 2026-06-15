/**
 * Minimal in-memory fixed-window rate limiter (best-effort, PER INSTANCE — not
 * shared across Railway replicas). Cheap defense against bulk token probing on
 * the public read endpoint; for hard guarantees use an edge/proxy limiter.
 *
 * Bounded: entries are pruned/capped so a flood of distinct keys (e.g. spoofed
 * X-Forwarded-For values) can't grow the Map without limit.
 */
const hits = new Map<string, { count: number; resetAt: number }>();
const MAX_ENTRIES = 20_000;

export function rateLimit(key: string, limit = 120, windowMs = 60_000): boolean {
  const now = Date.now();

  // Opportunistic cleanup when the Map grows large: drop expired, then hard-cap.
  if (hits.size >= MAX_ENTRIES) {
    for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
    if (hits.size >= MAX_ENTRIES) hits.clear();
  }

  const e = hits.get(key);
  if (!e || e.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (e.count >= limit) return false;
  e.count += 1;
  return true;
}
