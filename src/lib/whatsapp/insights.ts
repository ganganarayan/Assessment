import "server-only";
import { graph, type GraphFailure } from "@/lib/whatsapp/graph";

/**
 * Reading what Meta knows about a connected number.
 *
 * Six independent reads rather than one big one, deliberately. Graph fails the WHOLE
 * request when it does not recognise a single field, and these fields come and go
 * between versions - messaging_limit_tier and throughput are not even on the same
 * documentation page as the rest. One combined call would mean a dashboard that goes
 * completely blank because Meta renamed something we only wanted for one line of it.
 *
 * So every panel is its own request and its own failure. A panel that cannot be read
 * says so and the rest of the screen still works, which is the only honest way to
 * build a screen on top of somebody else's API.
 */

/* -------------------------------------------------------------------------- */
/* Health, quality, tier                                                       */
/* -------------------------------------------------------------------------- */

export interface PhoneHealth {
  displayPhone: string;
  verifiedName: string;
  /** GREEN, YELLOW, RED, NA or UNKNOWN. Meta's own word, not ours. */
  qualityRating: string | null;
  /** CONNECTED, PENDING, FLAGGED, RESTRICTED, ... */
  status: string | null;
  codeVerificationStatus: string | null;
  nameStatus: string | null;
  platformType: string | null;
  isOnBizApp: boolean;
}

interface RawPhoneHealth {
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  status?: string;
  code_verification_status?: string;
  name_status?: string;
  platform_type?: string;
  is_on_biz_app?: boolean;
}

/** The fields we have seen Meta serve reliably on a phone number. */
const PHONE_HEALTH_FIELDS =
  "display_phone_number,verified_name,quality_rating,status,code_verification_status,name_status,platform_type,is_on_biz_app";

export async function readPhoneHealth(args: {
  phoneNumberId: string;
  token: string;
  version: string;
}): Promise<({ ok: true } & { phone: PhoneHealth }) | GraphFailure> {
  const r = await graph<RawPhoneHealth>(
    `${args.version}/${args.phoneNumberId}?fields=${PHONE_HEALTH_FIELDS}`,
    { method: "GET", token: args.token },
  );
  if (!r.ok) return r;
  const d = r.data;
  return {
    ok: true,
    phone: {
      displayPhone: d.display_phone_number ?? "",
      verifiedName: d.verified_name ?? "",
      qualityRating: d.quality_rating ?? null,
      status: d.status ?? null,
      codeVerificationStatus: d.code_verification_status ?? null,
      nameStatus: d.name_status ?? null,
      platformType: d.platform_type ?? null,
      isOnBizApp: d.is_on_biz_app === true,
    },
  };
}

export interface SendingLimits {
  /** TIER_250, TIER_1K, TIER_10K, TIER_100K or TIER_UNLIMITED. */
  messagingLimitTier: string | null;
  /** Meta's throughput level, e.g. STANDARD or HIGH. */
  throughputLevel: string | null;
}

interface RawLimits {
  messaging_limit_tier?: string;
  throughput?: { level?: string };
}

/**
 * The tier and throughput, asked for SEPARATELY.
 *
 * 🟡 Both are documented away from the main phone-number reference and one of them has
 * been beta for a long time. Asking for them beside the fields above would mean a
 * single rename blanking the whole header, so they get their own request and the
 * screen says "not reported" when Meta will not serve them.
 */
export async function readSendingLimits(args: {
  phoneNumberId: string;
  token: string;
  version: string;
}): Promise<({ ok: true } & { limits: SendingLimits }) | GraphFailure> {
  const r = await graph<RawLimits>(
    `${args.version}/${args.phoneNumberId}?fields=messaging_limit_tier,throughput`,
    { method: "GET", token: args.token },
  );
  if (!r.ok) return r;
  return {
    ok: true,
    limits: {
      messagingLimitTier: r.data.messaging_limit_tier ?? null,
      throughputLevel: r.data.throughput?.level ?? null,
    },
  };
}

export interface HealthEntity {
  type: string;
  id: string;
  status: string;
  /** Meta's own explanation when something is LIMITED or BLOCKED. */
  problems: string[];
}

export interface HealthStatus {
  /** AVAILABLE, LIMITED or BLOCKED, rolled up across every node involved. */
  canSendMessage: string | null;
  entities: HealthEntity[];
}

interface RawHealth {
  health_status?: {
    can_send_message?: string;
    entities?: Array<{
      entity_type?: string;
      id?: string;
      can_send_message?: string;
      errors?: Array<{ error_description?: string; possible_solution?: string; error_code?: number }>;
      additional_info?: string[];
    }>;
  };
}

/**
 * Can this number actually send right now, and if not, why.
 *
 * The most useful single call on this screen. It rolls up the phone number, the WABA,
 * the business portfolio and the app, so it answers the question an owner actually has
 * - "why did nothing go out" - rather than making them infer it from four green ticks.
 */
export async function readHealthStatus(args: {
  nodeId: string;
  token: string;
  version: string;
}): Promise<({ ok: true } & { health: HealthStatus }) | GraphFailure> {
  const r = await graph<RawHealth>(`${args.version}/${args.nodeId}?fields=health_status`, {
    method: "GET",
    token: args.token,
  });
  if (!r.ok) return r;
  const h = r.data.health_status;
  return {
    ok: true,
    health: {
      canSendMessage: h?.can_send_message ?? null,
      entities: (h?.entities ?? []).map((e) => ({
        type: e.entity_type ?? "UNKNOWN",
        id: e.id ?? "",
        status: e.can_send_message ?? "UNKNOWN",
        // Meta puts the actionable half in possible_solution, so both are kept: the
        // description alone usually restates the status without saying what to do.
        problems: [
          ...(e.errors ?? []).map((x) =>
            [x.error_description, x.possible_solution].filter(Boolean).join(" "),
          ),
          ...(e.additional_info ?? []),
        ].filter((s) => s.trim().length > 0),
      })),
    },
  };
}

export interface WabaProfile {
  name: string | null;
  timezoneId: string | null;
  /** APPROVED, PENDING or REJECTED - the WABA's own review state. */
  accountReviewStatus: string | null;
  messageTemplateNamespace: string | null;
}

interface RawWaba {
  name?: string;
  timezone_id?: string;
  account_review_status?: string;
  message_template_namespace?: string;
}

export async function readWabaProfile(args: {
  wabaId: string;
  token: string;
  version: string;
}): Promise<({ ok: true } & { waba: WabaProfile }) | GraphFailure> {
  const r = await graph<RawWaba>(
    `${args.version}/${args.wabaId}?fields=name,timezone_id,account_review_status,message_template_namespace`,
    { method: "GET", token: args.token },
  );
  if (!r.ok) return r;
  return {
    ok: true,
    waba: {
      name: r.data.name ?? null,
      timezoneId: r.data.timezone_id ?? null,
      accountReviewStatus: r.data.account_review_status ?? null,
      messageTemplateNamespace: r.data.message_template_namespace ?? null,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Analytics                                                                   */
/* -------------------------------------------------------------------------- */

/** Unix SECONDS, which is what every analytics edge takes. */
const secs = (d: Date) => Math.floor(d.getTime() / 1000);

export interface DayPoint {
  /** Unix seconds, kept raw so the formatting happens once, at the edge. */
  start: number;
  sent: number;
  delivered: number;
}

interface RawAnalytics {
  analytics?: {
    data_points?: Array<{ start?: number; end?: number; sent?: number; delivered?: number }>;
  };
}

/**
 * Sent and delivered per day.
 *
 * 🟡 Meta cut the lookback window from ten years to one on 01-12-2025, so a range
 * further back than that comes back empty rather than erroring. Thirty days is the
 * default here and well inside it.
 */
export async function readMessagingAnalytics(args: {
  wabaId: string;
  token: string;
  version: string;
  from: Date;
  to: Date;
}): Promise<({ ok: true } & { points: DayPoint[] }) | GraphFailure> {
  const field = `analytics.start(${secs(args.from)}).end(${secs(args.to)}).granularity(DAY)`;
  const r = await graph<RawAnalytics>(`${args.version}/${args.wabaId}?fields=${field}`, {
    method: "GET",
    token: args.token,
  });
  if (!r.ok) return r;
  const points = (r.data.analytics?.data_points ?? []).map((p) => ({
    start: p.start ?? 0,
    sent: p.sent ?? 0,
    delivered: p.delivered ?? 0,
  }));
  return { ok: true, points };
}

export interface ConversationTotals {
  conversations: number;
  /** In the WABA's own billing currency, which Meta does not name on this edge. */
  cost: number;
}

interface RawConversations {
  conversation_analytics?: {
    data?: Array<{
      data_points?: Array<{ conversation?: number; cost?: number }>;
    }>;
  };
}

/**
 * Conversations and what they cost over the window.
 *
 * Totalled here rather than in the UI, because the response is a nested array of
 * arrays and the sum is the only part anybody reads on a dashboard. The granularity is
 * DAILY - note the spelling, which differs from the DAY the messaging edge wants, and
 * is exactly the kind of difference that makes one combined call a bad idea.
 */
export async function readConversationTotals(args: {
  wabaId: string;
  token: string;
  version: string;
  from: Date;
  to: Date;
}): Promise<({ ok: true } & { totals: ConversationTotals }) | GraphFailure> {
  const field = `conversation_analytics.start(${secs(args.from)}).end(${secs(args.to)}).granularity(DAILY)`;
  const r = await graph<RawConversations>(`${args.version}/${args.wabaId}?fields=${field}`, {
    method: "GET",
    token: args.token,
  });
  if (!r.ok) return r;
  let conversations = 0;
  let cost = 0;
  for (const group of r.data.conversation_analytics?.data ?? []) {
    for (const p of group.data_points ?? []) {
      conversations += p.conversation ?? 0;
      cost += p.cost ?? 0;
    }
  }
  return { ok: true, totals: { conversations, cost } };
}

export interface PricingRow {
  category: string;
  volume: number;
  cost: number;
}

interface RawPricing {
  pricing_analytics?: {
    data?: Array<{
      data_points?: Array<{
        pricing_category?: string;
        pricing_type?: string;
        volume?: number;
        cost?: number;
      }>;
    }>;
  };
}

/**
 * What was sent and what it cost, split by pricing category.
 *
 * This is the edge that matches how Meta bills now: per message, by category
 * (marketing, utility, authentication, service) rather than per 24-hour conversation.
 * Both are read, because the conversation edge is still the one that answers "how many
 * people did we actually talk to".
 */
export async function readPricingBreakdown(args: {
  wabaId: string;
  token: string;
  version: string;
  from: Date;
  to: Date;
}): Promise<({ ok: true } & { rows: PricingRow[] }) | GraphFailure> {
  const field =
    `pricing_analytics.start(${secs(args.from)}).end(${secs(args.to)})` +
    `.granularity(DAILY).dimensions(["PRICING_CATEGORY"])`;
  const r = await graph<RawPricing>(`${args.version}/${args.wabaId}?fields=${field}`, {
    method: "GET",
    token: args.token,
  });
  if (!r.ok) return r;

  // Summed per category, because DAILY granularity means one row per category per day
  // and nobody wants thirty rows of "marketing".
  const by = new Map<string, PricingRow>();
  for (const group of r.data.pricing_analytics?.data ?? []) {
    for (const p of group.data_points ?? []) {
      const key = p.pricing_category ?? p.pricing_type ?? "UNKNOWN";
      const row = by.get(key) ?? { category: key, volume: 0, cost: 0 };
      row.volume += p.volume ?? 0;
      row.cost += p.cost ?? 0;
      by.set(key, row);
    }
  }
  return { ok: true, rows: [...by.values()].sort((a, b) => b.cost - a.cost) };
}

export interface TemplateRow {
  templateId: string;
  sent: number;
  delivered: number;
  read: number;
  clicked: number;
}

interface RawTemplateAnalytics {
  template_analytics?: {
    data?: Array<{
      data_points?: Array<{
        template_id?: string;
        sent?: number;
        delivered?: number;
        read?: number;
        clicked?: Array<{ count?: number }>;
      }>;
    }>;
  };
}

/**
 * Per-template sends, reads and clicks.
 *
 * 🔴 Usually refused, and that is the correct outcome rather than a bug. Meta only
 * serves this once the WABA has is_enabled_for_insights set to true, and that switch
 * is IRREVERSIBLE. Nothing here turns it on: an unasked-for one-way change to
 * somebody's WhatsApp account is not a thing a dashboard gets to do, and the refusal
 * is passed through to the screen so the owner can decide for themselves.
 *
 * Even once enabled, Meta keeps read and click figures for about 7 days, so a 30-day
 * window will show sends with zero reads for the older part of it.
 */
export async function readTemplateAnalytics(args: {
  wabaId: string;
  token: string;
  version: string;
  from: Date;
  to: Date;
}): Promise<({ ok: true } & { rows: TemplateRow[] }) | GraphFailure> {
  const field =
    `template_analytics.start(${secs(args.from)}).end(${secs(args.to)})` + `.granularity(DAILY)`;
  const r = await graph<RawTemplateAnalytics>(`${args.version}/${args.wabaId}?fields=${field}`, {
    method: "GET",
    token: args.token,
  });
  if (!r.ok) return r;

  const by = new Map<string, TemplateRow>();
  for (const group of r.data.template_analytics?.data ?? []) {
    for (const p of group.data_points ?? []) {
      const key = p.template_id ?? "unknown";
      const row = by.get(key) ?? { templateId: key, sent: 0, delivered: 0, read: 0, clicked: 0 };
      row.sent += p.sent ?? 0;
      row.delivered += p.delivered ?? 0;
      row.read += p.read ?? 0;
      row.clicked += (p.clicked ?? []).reduce((a, c) => a + (c.count ?? 0), 0);
      by.set(key, row);
    }
  }
  return { ok: true, rows: [...by.values()].sort((a, b) => b.sent - a.sent) };
}
