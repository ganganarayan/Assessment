/**
 * The CUSTOM CRM sender's payload field catalog + a pure builder. The owner picks
 * which of these to include via checkboxes; the worker fills them per contact.
 * `contact.event_type` is the CRM routing key (its value is configurable).
 */

export const CUSTOM_FIELD_KEYS = [
  "contact_name",
  "contact_email",
  "contact_phone",
  "contact.event_type",
  "contact.assessment_diagnosis",
  "contact.assessment_score",
  "contact.result_band",
  "contact.score_raw",
  "contact.score_max",
  "contact.customer_id",
  "contact.result_url",
  "contact.ai_statement",
  "contact.assess_profession",
] as const;

export type CustomFieldKey = (typeof CUSTOM_FIELD_KEYS)[number];

export const CUSTOM_FIELD_LABELS: Record<CustomFieldKey, string> = {
  contact_name: "Name",
  contact_email: "Email",
  contact_phone: "Phone",
  "contact.event_type": "Event type (routing key)",
  "contact.assessment_diagnosis": "Diagnosis (band word)",
  "contact.assessment_score": "Score %",
  "contact.result_band": "Result band (level)",
  "contact.score_raw": "Score (raw)",
  "contact.score_max": "Score (max)",
  "contact.customer_id": "Customer ID",
  "contact.result_url": "Result URL",
  "contact.ai_statement": "AI statement",
  "contact.assess_profession": "Profession",
};

/** Default selection — the fields the diagnosis sender used. */
export const CUSTOM_FIELD_DEFAULTS: CustomFieldKey[] = [
  "contact_name",
  "contact_email",
  "contact_phone",
  "contact.event_type",
  "contact.assessment_diagnosis",
];

export function isCustomFieldKey(v: string): v is CustomFieldKey {
  return (CUSTOM_FIELD_KEYS as readonly string[]).includes(v);
}

/** Per-contact source values the builder maps the selected keys onto. */
export interface CustomFieldData {
  name: string | null;
  email: string | null;
  phone: string | null;
  diagnosis: string | null;
  scorePercent: number | null;
  bandLevel: string | null;
  scoreRaw: number | null;
  scoreMax: number | null;
  customerId: string | null;
  resultUrl: string | null;
  aiStatement: string | null;
  profession: string | null;
}

/**
 * Build the outbound payload from the selected field keys + the configured
 * event_type value + the contact's data. Only checked fields are emitted.
 */
export function buildCustomPayload(
  fields: readonly string[],
  eventType: string,
  d: CustomFieldData,
): Record<string, unknown> {
  const all: Record<CustomFieldKey, unknown> = {
    contact_name: d.name,
    contact_email: d.email,
    contact_phone: d.phone,
    "contact.event_type": eventType,
    "contact.assessment_diagnosis": d.diagnosis,
    "contact.assessment_score": d.scorePercent,
    "contact.result_band": d.bandLevel,
    "contact.score_raw": d.scoreRaw,
    "contact.score_max": d.scoreMax,
    "contact.customer_id": d.customerId,
    "contact.result_url": d.resultUrl,
    "contact.ai_statement": d.aiStatement,
    "contact.assess_profession": d.profession,
  };
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (isCustomFieldKey(f)) out[f] = all[f];
  }
  return out;
}
