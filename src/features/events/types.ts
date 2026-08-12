import { EventType } from "@prisma/client";

/**
 * Assess360 event vocabulary.
 *
 * Assess360 is the source of truth ONLY for assessment-related events. Funnel
 * events owned by other systems (video views, call bookings, payments) are NOT
 * emitted here. They may later be POSTed *into* Assess360 via a reserved ingest
 * API for unified reporting — the names below are reserved but NOT implemented.
 */
export const RESERVED_EXTERNAL_EVENTS = [
  "external.vsl_viewed",
  "external.strategy_call_booked",
] as const;

/** Enum value -> public dotted event name used in payloads, logs, and UI. */
export const EVENT_NAME: Record<EventType, string> = {
  [EventType.LEAD_CREATED]: "optin", // merged opt-in (was lead.created + assessment.started)
  [EventType.ASSESSMENT_STARTED]: "assessment.started", // DROPPED — never emitted; retained only to render historical logs
  [EventType.ASSESSMENT_COMPLETED]: "assessment.completed", // legacy; superseded by completed_unpaid
  [EventType.ASSESSMENT_COMPLETED_PAID]: "completed_paid", // paid mode, on payment
  [EventType.ASSESSMENT_COMPLETED_UNPAID]: "completed_unpaid", // ALL completions w/o in-app payment (free + paid-unpaid sweep)
  [EventType.RESULT_GENERATED]: "result.generated",
  [EventType.RESULT_VIEWED]: "result.viewed",
  [EventType.ASSESSMENT_ABANDONED]: "assessment.abandoned",
  [EventType.RESULT_LINK_REQUESTED]: "result.link_requested",
};

/** Reverse of EVENT_NAME: dotted name -> enum value. */
export const NAME_TO_TYPE: Record<string, EventType> = Object.fromEntries(
  (Object.entries(EVENT_NAME) as [EventType, string][]).map(([t, n]) => [n, t]),
);

/** All event types (for name resolution / historical logs). ASSESSMENT_STARTED is
 *  intentionally omitted — it is dropped (never emitted); its EVENT_NAME mapping is
 *  kept above only so old logs still render a friendly name. */
export const ALL_EVENT_TYPES: EventType[] = [
  EventType.LEAD_CREATED,
  EventType.ASSESSMENT_COMPLETED,
  EventType.ASSESSMENT_COMPLETED_PAID,
  EventType.ASSESSMENT_COMPLETED_UNPAID,
  EventType.RESULT_GENERATED,
  EventType.RESULT_VIEWED,
  EventType.ASSESSMENT_ABANDONED,
  EventType.RESULT_LINK_REQUESTED,
];

/**
 * Event types Assess360 actively emits + offers in the UI. `result.generated`
 * is intentionally excluded: it is a duplicate of `assessment.completed` today
 * (scoring is synchronous), so emitting it would create duplicate CRM records.
 * The enum value/name is retained for historical logs and a possible future
 * async result/report-ready step.
 */
export const ACTIVE_EVENT_TYPES: EventType[] = [
  EventType.LEAD_CREATED, // optin
  // ASSESSMENT_COMPLETED is intentionally EXCLUDED: free completions now emit
  // completed_unpaid (unified), so a "Completed — free" trigger would never fire.
  EventType.ASSESSMENT_COMPLETED_PAID, // paid mode, on payment
  EventType.ASSESSMENT_COMPLETED_UNPAID, // ALL completions w/o in-app payment (free + paid-unpaid)
  EventType.RESULT_VIEWED,
  EventType.ASSESSMENT_ABANDONED,
  EventType.RESULT_LINK_REQUESTED,
];

/**
 * Dotted names the app actually emits — the ONLY valid outbound-webhook event
 * names. The admin UI offers these in a dropdown and createWebhook rejects
 * anything else, so a typo (e.g. "aeeseement.completed") can never be saved as a
 * silently-never-delivering webhook.
 */
export const EMITTED_EVENT_NAMES: string[] = ACTIVE_EVENT_TYPES.map((t) => EVENT_NAME[t]);

/** Human label for each trigger, shown in the webhook trigger dropdown. */
export const EVENT_LABEL: Partial<Record<EventType, string>> = {
  [EventType.LEAD_CREATED]: "Opt-in (lead created)",
  [EventType.ASSESSMENT_COMPLETED]: "Completed — free assessment (legacy)",
  [EventType.ASSESSMENT_COMPLETED_PAID]: "Completed — paid (on payment)",
  [EventType.ASSESSMENT_COMPLETED_UNPAID]: "Completed — no payment (free + unpaid)",
  [EventType.RESULT_VIEWED]: "Result viewed",
  [EventType.ASSESSMENT_ABANDONED]: "Abandoned",
  [EventType.RESULT_LINK_REQUESTED]: "Result link requested",
};

/** Suggested default delivered name per trigger (the canonical event name). */
export const DEFAULT_EVENT_NAME: Partial<Record<EventType, string>> = Object.fromEntries(
  ACTIVE_EVENT_TYPES.map((t) => [t, EVENT_NAME[t]]),
) as Partial<Record<EventType, string>>;

/** Free-form delivered-name rule: lowercase letters/digits in dotted OR underscore
 *  segments — no binding to one separator. e.g. optin, completed_paid, lead.created. */
export const WEBHOOK_NAME_REGEX = /^[a-z0-9]+([._][a-z0-9]+)*$/;

/* ---------------------------------------------------- canonical payload ---- */

export interface PayloadTenant {
  id: string;
  slug: string;
  name: string;
}
/** Lead fields are ALWAYS present (null when not collected) for stable mapping. */
export interface PayloadLead {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  mobile: string | null;
  /** Chosen profession; emitted as contact.assess_profession on lead.created only. */
  profession: string | null;
}
/** Marketing attribution captured from the landing URL. Keys always present. */
export interface PayloadAttribution {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  fbclid: string | null;
  gclid: string | null;
}
export interface PayloadScore {
  total: number;
  max: number;
  percentage: number;
}
export interface PayloadResultBand {
  level: string;
  title: string;
}
export interface PayloadCategory {
  name: string;
  score: number;
  max: number;
  band: string | null;
  meaning: string | null;
}
/** Computed clinic-audit funnel figures, sent to the CRM on completion (CLINIC_AUDIT
 *  engine only). Flat numbers/strings so each maps to a contact.clinic_* custom field. */
export interface PayloadClinic {
  band: string;
  casesNow: number;
  revenueNow: number;
  casesPotential: number;
  revenuePotential: number;
  gapMonthly: number;
  gapAnnual: number;
  dormantValue: number;
  fiveCaseAdSpend: number;
}

/** metadata for assessment-related events. */
export interface AssessmentMetadata {
  assessmentId: string | null;
  assessmentTitle: string | null;
  assessmentSlug: string | null;
  assessmentUrl: string | null;
  resultUrl: string | null;
  score: PayloadScore | null;
  resultBand: PayloadResultBand | null;
  categories: PayloadCategory[] | null;
}

/**
 * THE canonical envelope every event/webhook carries.
 *
 * Contact is emitted in CRM-friendly FLAT form (GoHighLevel inbound-webhook
 * convention): standard fields `contact_name` / `contact_email` /
 * `contact_phone`, and every other contact attribute as a dotted custom-field
 * key `contact.<key>` (e.g. `contact.utm_source`). No nested contact object.
 *
 * The top level is stable across all events; only `metadata` varies by event
 * type — so new event types add their own metadata builder without changing
 * this base schema. New contact custom fields just add another `contact.<key>`.
 */
export interface EventEnvelope {
  event: string; // dotted name, e.g. "assessment.completed"
  event_type: string; // underscore name, e.g. "assessment_completed" (CRM-friendly)
  timestamp: string; // ISO timestamp
  source: "assess360";
  tenant: PayloadTenant | null;
  submission: { id: string } | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  metadata: Record<string, unknown>;
  /** Flat contact custom fields: contact.utm_source, contact.score, … */
  [contactField: `contact.${string}`]: string | number | null;
}

/**
 * Normalized input emitters pass to `emitEvent`. The central assembler
 * (lib/events/payload.ts) turns this into an EventEnvelope — emitters never
 * hand-build payloads.
 */
export interface EmitInput {
  submissionId?: string | null;
  customerId?: string | null;
  tenant?: PayloadTenant | null;
  assessment?: { id: string; slug: string; title: string } | null;
  lead?: Partial<PayloadLead> | null;
  score?: PayloadScore | null;
  resultBand?: PayloadResultBand | null;
  categories?: PayloadCategory[] | null;
  /** Destination/result URL (built server-side, e.g. `${targetUrl}?t=${token}`). */
  resultUrl?: string | null;
  /** AI-generated personalized statement (sent to the CRM as contact.ai_statement). */
  aiStatement?: string | null;
  /** CLINIC_AUDIT computed figures → contact.clinic_* custom fields + metadata.clinic. */
  clinic?: PayloadClinic | null;
  attribution?: Partial<PayloadAttribution> | null;
  /** Override the event timestamp (defaults to now). Used for deterministic samples. */
  timestamp?: string;
}

/** A webhook row enriched with usage stats (for the Webhooks page). */
export interface WebhookRow {
  id: string;
  eventType: string; // the trigger (EventType)
  eventLabel: string; // friendly trigger label
  name: string; // delivered event name (free format)
  url: string;
  status: "ACTIVE" | "INACTIVE";
  logCount: number;
  lastFired: string | null;
  /** True once a successful delivery has occurred — name/url are then frozen. */
  locked: boolean;
}

/**
 * One Webhook Logs row = an event firing, enriched with its latest webhook
 * delivery (event log and webhook log are one view).
 */
export interface EventActivityRow {
  id: string; // EventLog id
  eventName: string;
  createdAt: string;
  submissionId: string | null;
  leadEmail: string | null;
  payload: string; // event payload, pretty JSON
  endpoint: string | null; // webhook URL the payload was POSTed to
  deliveryStatus: "delivered" | "failed" | "none";
  responseStatus: number | null;
  attemptCount: number;
  responseBody: string | null;
  error: string | null;
  canRetry: boolean;
}
