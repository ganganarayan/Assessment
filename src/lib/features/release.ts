import { prisma } from "@/lib/db/prisma";
import { isPlatformScope } from "@/lib/tenant/platform-tenant";
import {
  FEATURE_RELEASE_KEYS,
  defaultReleased,
  isFeatureReleaseKey,
  type FeatureReleaseKey,
} from "@/lib/features/catalog";

/**
 * IS THIS FEATURE RELEASED TO CUSTOMERS YET?
 *
 * One switch per feature, for every workspace at once (see the FeatureRelease model).
 * The owner's scope is exempt: the platform itself, and any INTERNAL tenant
 * (Tenant.unlimited) - which is how a feature gets tested the way a customer will
 * actually meet it, from inside a workspace, before anybody else can see it.
 *
 * NOT `server-only`, on purpose, and for the same reason as lib/billing/plan-resolve:
 * the Railway crons run outside Next, where the `server-only` package does not resolve,
 * and a queue drain absolutely must honour this gate. A held-back feature that keeps
 * sending from cron is the exact failure this whole thing exists to prevent.
 *
 * 🔴 EVERY READ FAILS SAFE, PER FEATURE. A thrown query falls back to the catalog
 * default, which is true for anything customers already have and false for anything
 * they have never seen. So a database blip can take away neither a live feature nor the
 * hiding of an unfinished one.
 */

/**
 * How long a resolved switch is trusted in-process.
 *
 * It is cached because this is read on the hot path - once per workspace page render,
 * and once per run in a queue drain - and the answer changes about once a week. Ten
 * seconds is the compromise: a flip takes effect immediately on the instance that
 * served it (the toggle calls resetFeatureReleaseCache) and within ten seconds on every
 * other instance, while a drain of 200 runs costs one query instead of 200.
 */
const TTL_MS = 10_000;

interface Cached<T> {
  at: number;
  value: T;
}

let switchCache: Cached<Map<FeatureReleaseKey, boolean>> | null = null;
/** Per-tenant exemption (Tenant.unlimited), cached on the same clock. */
const exemptCache = new Map<string, Cached<boolean>>();

/** Drop everything cached here. Called by the toggle so a flip is visible at once. */
export function resetFeatureReleaseCache(): void {
  switchCache = null;
  exemptCache.clear();
}

function fresh<T>(entry: Cached<T> | null | undefined, now: number): entry is Cached<T> {
  return !!entry && now - entry.at < TTL_MS;
}

/**
 * The stored switches, keyed. A row for a key the catalog does not know is ignored
 * rather than trusted - a leftover row from a removed feature must not resurrect it.
 * Returns null when the read failed, which is how callers know to use the defaults.
 */
async function storedSwitches(): Promise<Map<FeatureReleaseKey, boolean> | null> {
  const now = Date.now();
  if (fresh(switchCache, now)) return switchCache.value;
  try {
    const rows = await prisma.featureRelease.findMany({ select: { key: true, released: true } });
    const map = new Map<FeatureReleaseKey, boolean>();
    for (const r of rows) if (isFeatureReleaseKey(r.key)) map.set(r.key, r.released);
    switchCache = { at: now, value: map };
    return map;
  } catch (e) {
    console.error("[features] release read failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * The global switch for one feature, ignoring who is asking. Use featureAllowedFor
 * unless you genuinely mean "has this been released", as the platform console does.
 */
export async function isFeatureReleased(key: FeatureReleaseKey): Promise<boolean> {
  const map = await storedSwitches();
  if (!map) return defaultReleased(key);
  const stored = map.get(key);
  return stored === undefined ? defaultReleased(key) : stored;
}

/**
 * Is this scope exempt from the switches - the platform itself, or one of the owner's
 * internal workspaces?
 *
 * The internal arm is the whole point of the design: the owner tests a feature as a
 * tenant, in a real workspace, with real data, while customers cannot see it. It is
 * also why holding a feature back never costs the businesses the owner runs themselves
 * anything - the same rule WhatsApp has used since it was parked.
 */
async function exemptScope(tenantId: string | null | undefined): Promise<boolean> {
  if (isPlatformScope(tenantId)) return true;
  const id = tenantId as string;
  const now = Date.now();
  const hit = exemptCache.get(id);
  if (fresh(hit, now)) return hit.value;
  try {
    const t = await prisma.tenant.findUnique({ where: { id }, select: { unlimited: true } });
    const value = t?.unlimited === true;
    exemptCache.set(id, { at: now, value });
    return value;
  } catch (e) {
    console.error("[features] exemption read failed:", e instanceof Error ? e.message : String(e));
    // Not exempt: an unreadable workspace is treated as a customer, which is the state
    // that shows them less rather than more.
    return false;
  }
}

/** May this workspace use this feature right now? Released, or an exempt scope. */
export async function featureAllowedFor(
  key: FeatureReleaseKey,
  tenantId: string | null | undefined,
): Promise<boolean> {
  if (await isFeatureReleased(key)) return true;
  return exemptScope(tenantId);
}

/**
 * Every key this workspace may use, in one pass. What the workspace shell calls, so a
 * page render costs one switch read and one exemption read however many features exist.
 */
export async function allowedFeaturesFor(
  tenantId: string | null | undefined,
): Promise<Set<FeatureReleaseKey>> {
  if (await exemptScope(tenantId)) return new Set(FEATURE_RELEASE_KEYS);
  const map = await storedSwitches();
  const out = new Set<FeatureReleaseKey>();
  for (const key of FEATURE_RELEASE_KEYS) {
    const stored = map?.get(key);
    if (stored === undefined ? defaultReleased(key) : stored) out.add(key);
  }
  return out;
}

/**
 * The message a refused action returns. Deliberately vague about WHY: a customer being
 * told "not released yet" is being told about a feature they cannot have.
 */
export const FEATURE_HELD_BACK = "That is not available in your workspace.";

/**
 * Guard for a server action: null when allowed, an ActionResult-shaped refusal when
 * not. Written to be dropped into the helper every action in a feature already calls
 * (the editor() / ownerScope() functions), so one line covers a whole feature and no
 * new action in that file can forget it.
 */
export async function featureDenied(
  key: FeatureReleaseKey,
  tenantId: string | null | undefined,
): Promise<{ ok: false; error: string } | null> {
  return (await featureAllowedFor(key, tenantId)) ? null : { ok: false, error: FEATURE_HELD_BACK };
}

/**
 * Set the switch for one feature. The only writer, so the cache reset and the audit
 * stamp cannot be forgotten by a caller.
 *
 * `releasedAt` is stamped on each turn-ON and LEFT ALONE on a turn-off, so the row
 * still answers "when did customers first get this" after a kill switch.
 */
export async function writeFeatureRelease(
  key: FeatureReleaseKey,
  released: boolean,
  changedByUserId: string | null,
  note?: string | null,
): Promise<void> {
  const stamp = released ? { releasedAt: new Date() } : {};
  await prisma.featureRelease.upsert({
    where: { key },
    update: { released, changedByUserId, note: note ?? null, ...stamp },
    create: { key, released, changedByUserId, note: note ?? null, ...stamp },
  });
  resetFeatureReleaseCache();
  // Deliberately logged: a release is the kind of change somebody will want to date
  // against a complaint, and a row's updatedAt is invisible from a log stream.
  console.info(`[features] ${key} ${released ? "RELEASED to customers" : "held back from customers"}`);
}
