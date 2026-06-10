/**
 * Central webhook/event payload assembler — the SINGLE source of truth for the
 * payload shape. Both real emission (lib/events/emit.ts) and the config-screen
 * preview (admin/webhooks) build payloads through here, so the preview can never
 * drift from what is actually sent.
 *
 * Pure: takes `baseUrl` as an argument (no env import) so it is unit-testable
 * without a server/DB — see scripts/verify-webhook-payload.ts.
 *
 * Extensibility: the top-level envelope is fixed; only `metadata` varies by
 * event type via METADATA_BUILDERS. A new event type registers its own builder
 * and the base schema is untouched.
 */
import { EventType } from "@prisma/client";
import {
  EVENT_NAME,
  NAME_TO_TYPE,
  type EventEnvelope,
  type EmitInput,
  type AssessmentMetadata,
  type PayloadLead,
  type PayloadAttribution,
} from "@/features/events/types";

const NULL_LEAD: PayloadLead = {
  firstName: null,
  lastName: null,
  email: null,
  mobile: null,
};
const NULL_ATTRIBUTION: PayloadAttribution = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  fbclid: null,
  gclid: null,
};

const stripSlash = (s: string) => s.replace(/\/+$/, "");

export function publicAssessmentUrl(baseUrl: string, slug: string): string {
  return `${stripSlash(baseUrl)}/a/${slug}`;
}
export function publicResultUrl(baseUrl: string, slug: string, submissionId: string): string {
  return `${stripSlash(baseUrl)}/a/${slug}/r/${submissionId}`;
}

/* ----------------------------------------------------- metadata registry --- */

// Builders return their own concrete metadata type; the envelope stores it as a
// generic record. (A named interface isn't assignable to Record<string,unknown>
// without an index signature, so we widen to `object` here and cast on use.)
type MetadataBuilder = (input: EmitInput, baseUrl: string) => object;

/** Metadata for every assessment-related event (uniform; nulls until available). */
function assessmentMetadata(input: EmitInput, baseUrl: string): AssessmentMetadata {
  const a = input.assessment ?? null;
  const slug = a?.slug ?? null;
  const sid = input.submissionId ?? null;
  // A result page exists only once the submission is scored (score present).
  const hasResult = sid !== null && slug !== null && input.score != null;
  return {
    assessmentId: a?.id ?? null,
    assessmentTitle: a?.title ?? null,
    assessmentSlug: slug,
    assessmentUrl: slug ? publicAssessmentUrl(baseUrl, slug) : null,
    resultUrl: hasResult ? publicResultUrl(baseUrl, slug as string, sid as string) : null,
    score: input.score ?? null,
    resultBand: input.resultBand ?? null,
  };
}

const METADATA_BUILDERS: Partial<Record<EventType, MetadataBuilder>> = {
  [EventType.LEAD_CREATED]: assessmentMetadata,
  [EventType.ASSESSMENT_STARTED]: assessmentMetadata,
  [EventType.ASSESSMENT_COMPLETED]: assessmentMetadata,
  [EventType.RESULT_GENERATED]: assessmentMetadata,
  [EventType.RESULT_VIEWED]: assessmentMetadata,
  [EventType.ASSESSMENT_ABANDONED]: assessmentMetadata,
};

/* --------------------------------------------------------- the assembler --- */

export function buildEnvelope(
  type: EventType,
  input: EmitInput,
  baseUrl: string,
): EventEnvelope {
  const builder = METADATA_BUILDERS[type];
  return {
    event: EVENT_NAME[type],
    timestamp: input.timestamp ?? new Date().toISOString(),
    source: "assess360",
    tenant: input.tenant ?? null,
    submission: input.submissionId ? { id: input.submissionId } : null,
    lead: { ...NULL_LEAD, ...(input.lead ?? {}) },
    attribution: { ...NULL_ATTRIBUTION, ...(input.attribution ?? {}) },
    metadata: builder ? (builder(input, baseUrl) as Record<string, unknown>) : {},
  };
}

/* --------------------------------------------------- preview sample data --- */

/** A representative payload for the config-screen preview (read-only). */
export function buildSamplePayload(eventName: string, baseUrl: string): EventEnvelope | null {
  const type = NAME_TO_TYPE[eventName];
  if (type === undefined) return null;

  const scored =
    type === EventType.ASSESSMENT_COMPLETED ||
    type === EventType.RESULT_VIEWED ||
    type === EventType.RESULT_GENERATED;

  return buildEnvelope(
    type,
    {
      timestamp: "2026-01-01T12:00:00.000Z",
      submissionId: "sub_3x4mpl3",
      tenant: { id: "tnt_acme", slug: "acme", name: "Acme Coaching" },
      assessment: {
        id: "asm_emotional",
        slug: "emotional-stability-assessment",
        title: "Emotional Stability Assessment",
      },
      lead: { firstName: "Ganesh", lastName: null, email: "ganesh@example.com", mobile: "+919999999999" },
      score: scored ? { total: 42, max: 60, percentage: 70 } : null,
      resultBand: scored ? { level: "HIGH", title: "High Emotional Load" } : null,
    },
    baseUrl,
  );
}
