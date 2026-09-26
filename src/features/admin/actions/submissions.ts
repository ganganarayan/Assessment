"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { resolveActingScope, scopeEditDenied } from "@/lib/tenant/acting";
import { sendAndLogLifecycleCapi } from "@/lib/meta/capi-log";
import { COMPLETION_EVENT_GATED, GATE_DISQUALIFIED_EVENT } from "@/features/assessment/schemas";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * Permanently delete selected submissions (contacts) and their results. Cascades
 * to answers, category scores and AI-statement versions (FK onDelete: Cascade).
 * Page views and audit logs (EventLog/WebhookLog reference submissionId as a
 * plain scalar) are not affected. Irreversible.
 *
 * TENANT-SCOPED: a tenant admin/staff-with-edit may delete ONLY their own tenant's
 * submissions — the delete is filtered by tenantId, so passing another tenant's id
 * simply matches nothing. A super admin acting globally (tenantId null) may delete
 * any. View-only staff are refused. This is what lets /w/submissions expose delete
 * safely, not just the platform console.
 */
export async function deleteSubmissions(ids: string[]): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;

  const clean = (ids ?? []).filter((id) => typeof id === "string" && id.length > 0);
  if (clean.length === 0) return { ok: true };

  // Super admin with no acting tenant = global; otherwise constrain to the scope's
  // tenant so a tenant can never delete across the boundary.
  const where =
    scope.isSuper && scope.tenantId === null
      ? { id: { in: clean } }
      : { id: { in: clean }, tenantId: scope.tenantId };
  await prisma.submission.deleteMany({ where });

  revalidatePath("/admin/analytics/contacts");
  revalidatePath("/admin/analytics/stats");
  revalidatePath("/admin/submissions");
  revalidatePath("/w/submissions");
  return { ok: true };
}

/**
 * Manually send a Meta verdict for ONE submission, after the owner has read the
 * lead — the gate's TEXT questions never auto-qualify anyone, so this is how
 * that judgement reaches Meta.
 *
 *   "QUALIFIED"    → QualifiedCompletion  (the same event a real completion fires)
 *   "DISQUALIFIED" → GateDisqualified     (the same event the page-1 gate fires)
 *
 * Both names are deliberate: they feed the audiences that already exist, rather
 * than fragmenting the ad account with review-only variants.
 *
 * On firing Disqualified for someone already in the Qualified audience: Meta has
 * no "remove from audience" event, and this does not attempt one. It works
 * because the ad sets exclude the GateDisqualified audience, and an exclusion
 * beats an inclusion — so the person stops being targeted without ever leaving
 * the first audience. That exclusion must exist in Ads Manager for this button
 * to have any effect.
 *
 * The eventId is stable per (submission, verdict), so a double-click or a second
 * look inside Meta's dedup window collapses to one event instead of inflating
 * the count. Outside that window it counts again, which is harmless for audience
 * membership (a set — being added twice adds nobody).
 *
 * Fires regardless of the assessment's Meta routing flag, by design: this is a
 * deliberate human action, not automated funnel telemetry.
 *
 * TENANT-SCOPED exactly like deleteSubmissions: a tenant can only act on its own
 * submissions, view-only staff are refused.
 */
export async function sendMetaVerdict(
  submissionId: string,
  verdict: "QUALIFIED" | "DISQUALIFIED",
): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;

  const where =
    scope.isSuper && scope.tenantId === null
      ? { id: submissionId }
      : { id: submissionId, tenantId: scope.tenantId };

  const s = await prisma.submission.findFirst({
    where,
    select: {
      id: true,
      tenantId: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      clientIp: true,
      userAgent: true,
      fbp: true,
      fbc: true,
      country: true,
      city: true,
      region: true,
      postalCode: true,
      metaExternalId: true,
      assessment: { select: { slug: true, title: true } },
    },
  });
  if (!s) return { ok: false, error: "Not found." };

  const qualified = verdict === "QUALIFIED";
  const outcome = await sendAndLogLifecycleCapi(
    {
      eventName: qualified ? COMPLETION_EVENT_GATED : GATE_DISQUALIFIED_EVENT,
      eventId: `meta-review:${verdict.toLowerCase()}:${s.id}`,
      eventTimeMs: Date.now(),
      eventSourceUrl: `${env.NEXT_PUBLIC_APP_URL}/a/${s.assessment.slug}`,
      user: {
        email: s.leadEmail,
        phone: s.leadMobile,
        firstName: s.leadFirstName,
        lastName: s.leadLastName,
        clientIpAddress: s.clientIp,
        clientUserAgent: s.userAgent,
        fbp: s.fbp,
        fbc: s.fbc,
        country: s.country,
        city: s.city,
        state: s.region,
        zip: s.postalCode,
        externalId: s.metaExternalId,
      },
      customData: { content_name: s.assessment.title, assessment_name: s.assessment.title },
    },
    {
      tenantId: s.tenantId,
      submissionId: s.id,
      name: [s.leadFirstName, s.leadLastName].filter(Boolean).join(" ") || null,
    },
  );

  // Stamp only on a real send, so the mark means "Meta has this", not "I clicked".
  // The send is already recorded in the CAPI log either way.
  if (!outcome.ok) return { ok: false, error: outcome.error ?? "Meta rejected the event." };

  await prisma.submission.update({
    where: { id: s.id },
    data: qualified ? { metaQualifiedAt: new Date() } : { metaDisqualifiedAt: new Date() },
  });

  revalidatePath("/admin/submissions");
  revalidatePath("/w/submissions");
  return { ok: true };
}
