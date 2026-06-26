import "server-only";
import { EventType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { buildEnvelope, shapePayload, normalizeAttribution } from "@/lib/events/payload";
import { buildCustomPayload, type CustomFieldData } from "@/lib/crm/custom-fields";
import { type EmitInput } from "@/features/events/types";
import { type ResultSnapshot } from "@/lib/result/snapshot";

const TIMEOUT_MS = 15_000;

/** Result of a single CRM send — includes the exact url + payload so the worker
 *  can log precisely what was sent. */
export interface CrmSendResult {
  ok: boolean;
  status?: number;
  error?: string;
  skipped?: boolean;
  url?: string;
  payload?: Record<string, unknown>;
}

/** Destination/result URL (mirrors buildResultUrl in the submission flow). */
function destinationUrl(
  targetUrl: string | null,
  slug: string,
  submissionId: string,
  token: string | null,
  baseUrl: string,
): string {
  if (token && targetUrl) {
    const sep = targetUrl.includes("?") ? "&" : "?";
    return `${targetUrl}${sep}t=${token}`;
  }
  return `${baseUrl}/a/${slug}/r/${submissionId}`;
}

async function postJson(url: string, payload: Record<string, unknown>): Promise<CrmSendResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, url, payload };
    }
    return { ok: true, status: res.status, url, payload };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), url, payload };
  }
}

/**
 * Build the CRM "score_updated" payload for one submission from its CURRENT
 * snapshot and POST it to the configured resend endpoint (crmResendUrl). Same flat
 * contact.* shape the CRM already maps, PLUS contact.event_type = "score_updated".
 * Returns the exact url + payload sent so the worker can log it.
 */
export async function sendScoreUpdate(submissionId: string): Promise<CrmSendResult> {
  const setting = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: { crmResendUrl: true },
  });
  const url = setting?.crmResendUrl?.trim();
  if (!url) return { ok: false, error: "No CRM resend URL configured." };

  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      customerId: true,
      resultToken: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      leadProfession: true,
      attribution: true,
      resultSnapshot: true,
      assessment: {
        select: {
          id: true,
          slug: true,
          title: true,
          targetUrl: true,
          tenant: { select: { id: true, slug: true, name: true } },
        },
      },
    },
  });
  if (!s || !s.assessment) return { ok: false, error: "Submission not found." };
  const snap = (s.resultSnapshot ?? null) as ResultSnapshot | null;
  if (!snap || typeof snap.scoreRaw !== "number") return { ok: false, error: "No result snapshot." };

  const baseUrl = env.NEXT_PUBLIC_APP_URL;
  const input: EmitInput = {
    submissionId,
    customerId: s.customerId,
    tenant: s.assessment.tenant,
    assessment: { id: s.assessment.id, slug: s.assessment.slug, title: s.assessment.title },
    lead: {
      firstName: s.leadFirstName,
      lastName: s.leadLastName,
      email: s.leadEmail,
      mobile: s.leadMobile,
      profession: s.leadProfession,
    },
    score: { total: snap.scoreRaw, max: snap.max, percentage: snap.scorePercent },
    resultBand: snap.resultBandLevel ? { level: snap.resultBandLevel, title: snap.resultBand ?? "" } : null,
    categories: Array.isArray(snap.categories) ? snap.categories : null,
    resultUrl: destinationUrl(s.assessment.targetUrl, s.assessment.slug, submissionId, s.resultToken, baseUrl),
    aiStatement: snap.aiStatement,
    attribution: normalizeAttribution(s.attribution) ?? undefined,
  };

  const envelope = buildEnvelope(EventType.ASSESSMENT_COMPLETED, input, baseUrl);
  const payload = shapePayload(EventType.ASSESSMENT_COMPLETED, envelope);
  // The match key the CRM automation filters on (distinct from the top-level event_type).
  payload["contact.event_type"] = "score_updated";

  return postJson(url, payload);
}

/**
 * The generic CUSTOM sender (was "Diagnosis"): builds a payload from the owner-
 * selected fields + configured event_type, and POSTs to crmDiagnosisUrl. Refuses
 * (never falls back to the score endpoint) when the custom URL is unset.
 */
export async function sendCustomUpdate(submissionId: string): Promise<CrmSendResult> {
  const setting = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: { crmDiagnosisUrl: true, crmCustomEventType: true, crmCustomFields: true },
  });
  const url = setting?.crmDiagnosisUrl?.trim();
  if (!setting || !url) return { ok: false, error: "No custom CRM URL configured." };

  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      customerId: true,
      resultToken: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      leadProfession: true,
      resultSnapshot: true,
      resultBand: { select: { title: true } },
      assessment: { select: { slug: true, targetUrl: true } },
    },
  });
  if (!s) return { ok: false, error: "Submission not found." };
  const snap = (s.resultSnapshot ?? null) as ResultSnapshot | null;
  const baseUrl = env.NEXT_PUBLIC_APP_URL;

  const data: CustomFieldData = {
    name: [s.leadFirstName, s.leadLastName].map((p) => p?.trim() ?? "").filter(Boolean).join(" ") || null,
    email: s.leadEmail?.trim() || null,
    phone: s.leadMobile?.trim() || null,
    diagnosis: snap?.resultBand ?? s.resultBand?.title ?? null,
    scorePercent: snap && snap.scorePercent != null ? Math.round(snap.scorePercent) : null,
    bandLevel: snap?.resultBandLevel ?? null,
    scoreRaw: snap?.scoreRaw ?? null,
    scoreMax: snap?.max ?? null,
    customerId: s.customerId ?? null,
    resultUrl: s.assessment
      ? destinationUrl(s.assessment.targetUrl, s.assessment.slug, submissionId, s.resultToken, baseUrl)
      : null,
    aiStatement: snap?.aiStatement ?? null,
    profession: s.leadProfession ?? null,
  };

  const payload = buildCustomPayload(setting.crmCustomFields, setting.crmCustomEventType, data);
  if (!data.email && !data.phone) {
    return { ok: false, skipped: true, error: "No email or phone to match on.", url, payload };
  }
  return postJson(url, payload);
}
