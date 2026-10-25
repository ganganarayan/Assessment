import "server-only";
import {
  readConversationTotals,
  readHealthStatus,
  readMessagingAnalytics,
  readPhoneHealth,
  readPricingBreakdown,
  readSendingLimits,
  readTemplateAnalytics,
  readWabaProfile,
  type ConversationTotals,
  type DayPoint,
  type HealthStatus,
  type PhoneHealth,
  type PricingRow,
  type SendingLimits,
  type TemplateRow,
  type WabaProfile,
} from "@/lib/whatsapp/insights";

/**
 * One trip to Meta, seven reads, stored as a snapshot.
 *
 * It is a SNAPSHOT and not a live read because these edges are rate limited and a
 * dashboard is the one screen people reload. Reading Meta on every page view would
 * spend somebody's quota on them staring at the same numbers, and the first casualty
 * of a throttle is the sending that actually matters.
 *
 * So the screen shows stored figures with the time they were taken, and refreshing is
 * a button somebody presses. An honest "as of 14:05" beats a live number that is
 * sometimes an error page.
 */

export const SNAPSHOT_WINDOW_DAYS = 30;

/** How old a snapshot has to be before the screen suggests refreshing it. */
export const SNAPSHOT_STALE_MS = 60 * 60 * 1000;

export interface WabaSnapshot {
  /** ISO. Machine field, formatted for people at the edge, per the date rules. */
  fetchedAt: string;
  windowFrom: string;
  windowTo: string;
  phone: PhoneHealth | null;
  limits: SendingLimits | null;
  health: HealthStatus | null;
  waba: WabaProfile | null;
  messaging: DayPoint[] | null;
  conversations: ConversationTotals | null;
  pricing: PricingRow[] | null;
  templates: TemplateRow[] | null;
  /**
   * Panel name to Meta's own refusal, for the panels that failed.
   *
   * Kept rather than collapsed into one error, because these fail independently and
   * for unrelated reasons: template analytics is refused until an irreversible switch
   * is thrown, while a tier is simply not served on some versions. One combined "could
   * not load" would hide the difference between "not available to you" and "broken".
   */
  problems: Record<string, string>;
}

export async function buildWabaSnapshot(args: {
  phoneNumberId: string;
  wabaId: string;
  token: string;
  version: string;
  now?: Date;
}): Promise<WabaSnapshot> {
  const to = args.now ?? new Date();
  const from = new Date(to.getTime() - SNAPSHOT_WINDOW_DAYS * 86_400_000);
  const base = { token: args.token, version: args.version };
  const range = { ...base, wabaId: args.wabaId, from, to };

  // All seven at once, and none of them can reject: every reader returns a result
  // object. Promise.all is therefore safe and the whole screen costs one round trip
  // rather than seven.
  const [phone, limits, health, waba, messaging, conversations, pricing, templates] =
    await Promise.all([
      readPhoneHealth({ ...base, phoneNumberId: args.phoneNumberId }),
      readSendingLimits({ ...base, phoneNumberId: args.phoneNumberId }),
      // Asked on the PHONE NUMBER, because Meta rolls the answer up from there through
      // the WABA, the business portfolio and the app. Asking the WABA would leave out
      // the one node the owner can usually do something about.
      readHealthStatus({ ...base, nodeId: args.phoneNumberId }),
      readWabaProfile({ ...base, wabaId: args.wabaId }),
      readMessagingAnalytics(range),
      readConversationTotals(range),
      readPricingBreakdown(range),
      readTemplateAnalytics(range),
    ]);

  const problems: Record<string, string> = {};
  const keep = <T>(name: string, r: { ok: true } | { ok: false; error: string }, value: T): T | null => {
    if (r.ok) return value;
    problems[name] = r.error;
    return null;
  };

  return {
    fetchedAt: to.toISOString(),
    windowFrom: from.toISOString(),
    windowTo: to.toISOString(),
    phone: keep("number", phone, phone.ok ? phone.phone : null),
    limits: keep("limits", limits, limits.ok ? limits.limits : null),
    health: keep("health", health, health.ok ? health.health : null),
    waba: keep("account", waba, waba.ok ? waba.waba : null),
    messaging: keep("messages", messaging, messaging.ok ? messaging.points : null),
    conversations: keep("conversations", conversations, conversations.ok ? conversations.totals : null),
    pricing: keep("cost", pricing, pricing.ok ? pricing.rows : null),
    templates: keep("templates", templates, templates.ok ? templates.rows : null),
    // Last, because `keep` fills it as it goes and reading it before the panels would
    // always give an empty object.
    problems,
  };
}

/** Is this snapshot old enough that the screen should say so? */
export function snapshotIsStale(fetchedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!fetchedAt) return true;
  const t = new Date(fetchedAt).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > SNAPSHOT_STALE_MS;
}
