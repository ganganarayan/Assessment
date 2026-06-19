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
  type PayloadCategory,
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
  utm_term: null,
  utm_content: null,
  fbclid: null,
  gclid: null,
};

/**
 * Sanitize untrusted attribution (from the landing URL or a stored JSON row)
 * into the canonical block: only known keys, trimmed, length-capped. Returns
 * null when nothing meaningful is present (so the column stays NULL).
 */
export function normalizeAttribution(input: unknown): PayloadAttribution | null {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: PayloadAttribution = { ...NULL_ATTRIBUTION };
  let any = false;
  for (const key of Object.keys(NULL_ATTRIBUTION) as (keyof PayloadAttribution)[]) {
    const v = src[key];
    const s = typeof v === "string" ? v.trim().slice(0, 512) : "";
    if (s) {
      out[key] = s;
      any = true;
    }
  }
  return any ? out : null;
}

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
    // Destination URL (targetUrl?t=token) is passed in on completion; otherwise
    // fall back to the internal result page when a result exists.
    resultUrl:
      input.resultUrl ??
      (hasResult ? publicResultUrl(baseUrl, slug as string, sid as string) : null),
    score: input.score ?? null,
    resultBand: input.resultBand ?? null,
    categories: input.categories ?? null,
  };
}

const METADATA_BUILDERS: Partial<Record<EventType, MetadataBuilder>> = {
  [EventType.LEAD_CREATED]: assessmentMetadata,
  [EventType.ASSESSMENT_STARTED]: assessmentMetadata,
  [EventType.ASSESSMENT_COMPLETED]: assessmentMetadata,
  [EventType.RESULT_GENERATED]: assessmentMetadata,
  [EventType.RESULT_VIEWED]: assessmentMetadata,
  [EventType.ASSESSMENT_ABANDONED]: assessmentMetadata,
  [EventType.RESULT_LINK_REQUESTED]: assessmentMetadata,
};

/* --------------------------------------------------------- the assembler --- */

export function buildEnvelope(
  type: EventType,
  input: EmitInput,
  baseUrl: string,
): EventEnvelope {
  const builder = METADATA_BUILDERS[type];
  const lead = { ...NULL_LEAD, ...(input.lead ?? {}) };
  const attribution = { ...NULL_ATTRIBUTION, ...(input.attribution ?? {}) };

  const fullName =
    [lead.firstName, lead.lastName]
      .map((p) => (typeof p === "string" ? p.trim() : ""))
      .filter(Boolean)
      .join(" ") || null;

  const envelope: EventEnvelope = {
    event: EVENT_NAME[type],
    timestamp: input.timestamp ?? new Date().toISOString(),
    source: "assess360",
    tenant: input.tenant ?? null,
    submission: input.submissionId ? { id: input.submissionId } : null,
    contact_name: fullName,
    contact_email: lead.email ?? null,
    contact_phone: lead.mobile ?? null,
    metadata: builder ? (builder(input, baseUrl) as Record<string, unknown>) : {},
  };

  // Flat contact custom fields (CRM auto-maps contact.<key>).
  for (const [key, value] of Object.entries(attribution)) {
    envelope[`contact.${key}`] = value;
  }
  // Result fields as flat contact custom fields too (null on non-scored events).
  const m = envelope.metadata as Record<string, unknown>;
  const score = m.score as { percentage?: number; total?: number; max?: number } | null;
  const band = m.resultBand as { level?: string } | null;
  // Round percentage so the webhook agrees with the read endpoint / connector
  // (both use Math.round(percentage)); metadata.score keeps the precise value.
  const pctRounded = score && score.percentage != null ? Math.round(score.percentage) : null;
  envelope["contact.customer_id"] = input.customerId ?? null;
  envelope["contact.score"] = pctRounded; // kept for back-compat
  envelope["contact.scorePercent"] = pctRounded;
  envelope["contact.scoreRaw"] = score?.total ?? null;
  envelope["contact.max"] = score?.max ?? null;
  envelope["contact.result_band"] = band?.level ?? null;
  envelope["contact.result_url"] = (m.resultUrl as string | null) ?? null;
  envelope["contact.ai_statement"] = input.aiStatement ?? null;

  // Per-category bands as flat contact custom fields (keyed by exact category
  // name), so the CRM can map e.g. `contact.Sleep & Mental Recovery band`.
  const cats = (m.categories as PayloadCategory[] | null) ?? null;
  if (cats) {
    for (const c of cats) {
      envelope[`contact.${c.name} band`] = c.band;
      envelope[`contact.${c.name} meaning`] = c.meaning;
      envelope[`contact.${c.name} score`] = c.score;
    }
  }

  return envelope;
}

/* --------------------------------------------------- preview sample data --- */

/** A representative payload for the config-screen preview (read-only). */
export function buildSamplePayload(eventName: string, baseUrl: string): EventEnvelope | null {
  const type = NAME_TO_TYPE[eventName];
  if (type === undefined) return null;

  const scored =
    type === EventType.ASSESSMENT_COMPLETED ||
    type === EventType.RESULT_VIEWED ||
    type === EventType.RESULT_GENERATED ||
    type === EventType.RESULT_LINK_REQUESTED;

  return buildEnvelope(
    type,
    {
      timestamp: "2026-01-01T12:00:00.000Z",
      submissionId: "sub_3x4mpl3",
      customerId: "K7M2P9QX",
      tenant: { id: "tnt_acme", slug: "acme", name: "Acme Coaching" },
      assessment: {
        id: "asm_emotional",
        slug: "emotional-stability-assessment",
        title: "Emotional Stability Assessment",
      },
      lead: { firstName: "Ganesh", lastName: "Kumar", email: "ganesh@example.com", mobile: "+919999999999" },
      attribution: {
        utm_source: "fb",
        utm_medium: "Facebook_Mobile_Feed",
        utm_campaign: "Q2 Emotional Stability",
        utm_content: "Stress Ad A",
        fbclid: "IwAR0Example",
      },
      score: scored ? { total: 42, max: 60, percentage: 70 } : null,
      resultBand: scored ? { level: "HIGH", title: "High Emotional Load" } : null,
    },
    baseUrl,
  );
}
