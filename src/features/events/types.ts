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
};

/** Reverse of EVENT_NAME: dotted name -> enum value. */
export const NAME_TO_TYPE: Record<string, EventType> = Object.fromEntries(
  (Object.entries(EVENT_NAME) as [EventType, string][]).map(([t, n]) => [n, t]),
);

/** All event types in display order. */
export const ALL_EVENT_TYPES: EventType[] = [
  EventType.LEAD_CREATED,
  EventType.ASSESSMENT_STARTED,
  EventType.ASSESSMENT_COMPLETED,
  EventType.RESULT_GENERATED,
  EventType.RESULT_VIEWED,
  EventType.ASSESSMENT_ABANDONED,
];

/** Standardized envelope every webhook/event carries. */
export interface EventEnvelope {
  event: string; // dotted name, e.g. "assessment.completed"
  type: EventType;
  occurredAt: string; // ISO timestamp
  source: "assess360";
  data: Record<string, unknown>;
}

/** Context attached to the EventLog row for querying/segmentation. */
export interface EmitContext {
  submissionId?: string | null;
  assessmentId?: string | null;
  leadEmail?: string | null;
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
