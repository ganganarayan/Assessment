import "server-only";
import { EventType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { buildEnvelope, shapePayload, normalizeAttribution } from "@/lib/events/payload";
import { type EmitInput } from "@/features/events/types";
import { type ResultSnapshot } from "@/lib/result/snapshot";

const TIMEOUT_MS = 15_000;

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

/**
 * Build the CRM "score_updated" payload for one submission from its CURRENT
 * snapshot (post band-recompute + AI re-run) and POST it to the configured
 * resend endpoint. The payload is the same flat contact.* shape the CRM already
 * maps (via the assessment.completed envelope) PLUS `contact.event_type =
 * "score_updated"` so the automation can match on it. No auth (per the endpoint).
 * Fail-soft: returns {ok:false, error} instead of throwing.
 */
export async function sendScoreUpdate(
  submissionId: string,
): Promise<{ ok: boolean; status?: number; error?: string }> {
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

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Minimal CRM update used by the diagnosis backfill: posts ONLY the contact's
 * email + their assessment diagnosis (the overall band word) to the configured
 * endpoint, tagged contact.event_type=diagnosis_update so the CRM can route it to
 * a field-update automation. Lets the CRM populate the diagnosis on existing
 * contacts (matched by email). Returns {ok:false,...} for missing email/diagnosis.
 */
export async function sendDiagnosisUpdate(
  submissionId: string,
): Promise<{ ok: boolean; status?: number; error?: string; skipped?: boolean }> {
  const setting = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: { crmResendUrl: true },
  });
  const url = setting?.crmResendUrl?.trim();
  if (!url) return { ok: false, error: "No CRM resend URL configured." };

  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { leadEmail: true, resultSnapshot: true, resultBand: { select: { title: true } } },
  });
  if (!s) return { ok: false, error: "Submission not found." };
  const snap = (s.resultSnapshot ?? null) as ResultSnapshot | null;
  const diagnosis = snap?.resultBand ?? s.resultBand?.title ?? null;
  const email = s.leadEmail?.trim() || null;
  if (!email || !diagnosis) return { ok: false, skipped: true, error: "No email or diagnosis." };

  const payload: Record<string, unknown> = {
    contact_email: email,
    "contact.event_type": "diagnosis_update",
    "contact.assessment_diagnosis": diagnosis,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
