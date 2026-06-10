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
  [EventType.LEAD_CREATED]: "lead.created",
  [EventType.ASSESSMENT_STARTED]: "assessment.started",
  [EventType.ASSESSMENT_COMPLETED]: "assessment.completed",
  [EventType.RESULT_GENERATED]: "result.generated",
  [EventType.RESULT_VIEWED]: "result.viewed",
  [EventType.ASSESSMENT_ABANDONED]: "assessment.abandoned",
  [EventType.RESULT_LINK_REQUESTED]: "result.link_requested",
};

/** Reverse of EVENT_NAME: dotted name -> enum value. */
export const NAME_TO_TYPE: Record<string, EventType> = Object.fromEntries(
  (Object.entries(EVENT_NAME) as [EventType, string][]).map(([t, n]) => [n, t]),
);

/** All event types (for name resolution / historical logs). */
export const ALL_EVENT_TYPES: EventType[] = [
  EventType.LEAD_CREATED,
  EventType.ASSESSMENT_STARTED,
  EventType.ASSESSMENT_COMPLETED,
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
  EventType.LEAD_CREATED,
  EventType.ASSESSMENT_STARTED,
  EventType.ASSESSMENT_COMPLETED,
  EventType.RESULT_VIEWED,
  EventType.ASSESSMENT_ABANDONED,
  EventType.RESULT_LINK_REQUESTED,
];

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
/** metadata for assessment-related events. */
export interface AssessmentMetadata {
  assessmentId: string | null;
  assessmentTitle: string | null;
  assessmentSlug: string | null;
  assessmentUrl: string | null;
  resultUrl: string | null;
  score: PayloadScore | null;
  resultBand: PayloadResultBand | null;
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
  tenant?: PayloadTenant | null;
  assessment?: { id: string; slug: string; title: string } | null;
  lead?: Partial<PayloadLead> | null;
  score?: PayloadScore | null;
  resultBand?: PayloadResultBand | null;
  attribution?: Partial<PayloadAttribution> | null;
  /** Override the event timestamp (defaults to now). Used for deterministic samples. */
  timestamp?: string;
}

/** A webhook row enriched with usage stats (for the Webhooks page). */
export interface WebhookRow {
  id: string;
  name: string;
  url: string;
  status: "ACTIVE" | "INACTIVE";
  logCount: number;
  lastFired: string | null;
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
