import "server-only";
import { EventType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { emitEvent } from "@/lib/events/emit";
import { normalizeAttribution } from "@/lib/events/payload";
import { type EmitInput } from "@/features/events/types";
import { type ResultSnapshot } from "@/lib/result/snapshot";
import { appendVidapulseId, resolveVidapulseParam } from "@/lib/vidapulse";

/**
 * Resolve the tenant's effective VidaPulse param name ("cid" by default; null when
 * that tenant has turned tracking off). Platform/Gita assessments (tenantId null)
 * read the singleton setting. Callers pass this + the submission's opaque customerId
 * into the result-URL builders so the id rides on the URL saved in the CRM — the
 * link operators re-send (WABA/email) to nurture people who didn't watch the VSL.
 */
export async function vidapulseParamForTenant(tenantId: string | null): Promise<string | null> {
  const setting = tenantId
    ? await prisma.appSetting.findUnique({ where: { tenantId }, select: { vidapulseTrackingEnabled: true, vidapulseParam: true } })
    : await prisma.appSetting.findUnique({ where: { id: "singleton" }, select: { vidapulseTrackingEnabled: true, vidapulseParam: true } });
  return resolveVidapulseParam(setting);
}

export function resultUrlFor(
  targetUrl: string | null,
  slug: string,
  submissionId: string,
  token: string | null,
  customerId: string | null = null,
  vidapulseParam: string | null = null,
): string {
  let url = `${env.NEXT_PUBLIC_APP_URL}/a/${slug}/r/${submissionId}`;
  if (targetUrl && token) {
    try {
      const u = new URL(targetUrl);
      u.searchParams.set("t", token);
      // r = the SAME result token. Our funnel builder forwards the page URL's ?r=
      // onto the embedded VidaPulse iframe's own src, so it maps the viewer even in
      // Facebook/Instagram in-app browsers (no referrer). Duplicate of t by design.
      u.searchParams.set("r", token);
      url = u.toString();
    } catch {
      /* malformed targetUrl — keep the internal result-page fallback */
    }
  }
  // Append the opaque customerId alongside the token (no-op when tracking is off or
  // no id) so the VSL (or the operator's destination page) can bind it in VidaPulse.
  return appendVidapulseId(url, vidapulseParam, customerId);
}

/**
 * A client-shareable link to the result ON assess360 (never an external VSL). Carries
 * the person's token so the page can serve their LATEST completed attempt and render
 * the client view (no internal contact/band block). This is the link an operator
 * hands the clinic owner to refer to and recalculate.
 */
export function shareableResultUrl(
  slug: string,
  submissionId: string,
  token: string | null,
  customerId: string | null = null,
  vidapulseParam: string | null = null,
): string {
  const base = `${env.NEXT_PUBLIC_APP_URL}/a/${slug}/r/${submissionId}`;
  // r duplicates t (same result token) so the VidaPulse ?r= reader maps this viewer.
  const withToken = token
    ? `${base}?t=${encodeURIComponent(token)}&r=${encodeURIComponent(token)}`
    : base;
  return appendVidapulseId(withToken, vidapulseParam, customerId);
}

/**
 * Pick the Result URL shown in the Submissions table. A clinic audit (or any
 * assessment set to show results on assess360) must NOT point at an external URL —
 * its result only renders on our own page — so it gets the shareable token link.
 * Everything else keeps the destination/VSL behaviour (targetUrl + token).
 */
export function pickResultUrl(args: {
  engine: string | null;
  nextStep: string | null;
  targetUrl: string | null;
  slug: string;
  submissionId: string;
  token: string | null;
  customerId?: string | null;
  vidapulseParam?: string | null;
}): string {
  const onAssess360 = args.engine === "CLINIC_AUDIT" || args.nextStep === "RESULTS";
  return onAssess360
    ? shareableResultUrl(args.slug, args.submissionId, args.token, args.customerId ?? null, args.vidapulseParam ?? null)
    : resultUrlFor(args.targetUrl, args.slug, args.submissionId, args.token, args.customerId ?? null, args.vidapulseParam ?? null);
}

/**
 * Build the full completion EmitInput (score/band/categories/ai/lead/result url)
 * from a submission's stored snapshot — shared by the paid + unpaid emitters.
 */
export async function loadCompletionInput(submissionId: string): Promise<EmitInput | null> {
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
        select: { id: true, slug: true, title: true, targetUrl: true, tenant: { select: { id: true, slug: true, name: true } } },
      },
    },
  });
  if (!s || !s.assessment) return null;
  const snap = (s.resultSnapshot ?? null) as ResultSnapshot | null;
  const vidapulseParam = await vidapulseParamForTenant(s.assessment.tenant?.id ?? null);

  return {
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
    score: snap && typeof snap.scoreRaw === "number" ? { total: snap.scoreRaw, max: snap.max, percentage: snap.scorePercent } : null,
    resultBand: snap?.resultBandLevel ? { level: snap.resultBandLevel, title: snap.resultBand ?? "" } : null,
    categories: Array.isArray(snap?.categories) ? snap.categories : null,
    resultUrl: resultUrlFor(s.assessment.targetUrl, s.assessment.slug, submissionId, s.resultToken, s.customerId, vidapulseParam),
    aiStatement: snap?.aiStatement ?? null,
    attribution: normalizeAttribution(s.attribution) ?? undefined,
  };
}

/**
 * Fire `completed_paid` once for a submission (on verified payment). Guarded by a
 * compare-and-swap on completedPaidAt + status COMPLETED so a duplicate verify
 * never double-emits and an out-of-order payment (before completion) is skipped.
 * Never throws (the verify route must still redirect); on emit failure the claim
 * is rolled back so a retry can re-emit.
 */
export async function emitCompletedPaid(submissionId: string): Promise<void> {
  // Key on completedAt (ever completed) + completedPaidAt null, NOT on the live
  // status — a re-completion may have transiently flipped status to STARTED, and
  // the payment must still be recorded.
  const claim = await prisma.submission.updateMany({
    where: { id: submissionId, completedAt: { not: null }, completedPaidAt: null },
    data: { completedPaidAt: new Date() },
  });
  if (claim.count === 0) return; // already emitted, or never completed
  try {
    const input = await loadCompletionInput(submissionId);
    if (input) await emitEvent(EventType.ASSESSMENT_COMPLETED_PAID, input);
  } catch (e) {
    // Roll back the claim so a re-hit of the verify route can re-emit.
    await prisma.submission.updateMany({ where: { id: submissionId }, data: { completedPaidAt: null } }).catch(() => {});
    console.error("[completed_paid] emit failed, rolled back:", e instanceof Error ? e.message : String(e));
  }
}
