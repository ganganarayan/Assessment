import { NextResponse } from "next/server";
import { EventType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { emitEvent } from "@/lib/events/emit";
import { normalizeAttribution } from "@/lib/events/payload";
import { readResultPage, normalizeHref, type ButtonConfig } from "@/features/assessment/result-page/blocks";
import { stampVidapulseCtaUrl } from "@/lib/vidapulse";
import { sendCtaNotification } from "@/lib/cta/notify";
import { ctaResultUrl } from "@/lib/cta/result-url";

/**
 * Booking-CTA click tracker + redirect.
 *
 * The result page's booking button points HERE instead of straight at its destination,
 * because the thank-you page lives in the CRM: once the respondent leaves, nothing ever
 * comes back to say who asked for a call. Routing the click through the app is the only
 * point at which that is knowable.
 *
 * On a click: record it, emit `booking_requested` (which enqueues a DURABLE webhook
 * delivery to the CRM - retried by the cron until it lands), and email the owner. Then
 * 302 to the same destination the button always had, with the VidaPulse ids stamped on
 * exactly as the direct link stamps them, so click tracking there is unaffected.
 *
 * The destination comes from the assessment's PUBLISHED result page (operator-set,
 * never request input), so there is no open-redirect surface: a caller can only choose
 * which saved block to follow, not where it goes.
 *
 * Deliberately awaited rather than fire-and-forget. A booking request is the highest
 * intent signal in the funnel, so a second of redirect latency is a fair price for the
 * webhook and the notification being on disk before the respondent leaves.
 */
export const dynamic = "force-dynamic";

/** Nothing to forward to - send them somewhere real rather than a dead tab. */
function fallback() {
  return NextResponse.redirect(env.NEXT_PUBLIC_APP_URL, 302);
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ submissionId: string; blockId: string }> },
) {
  const { submissionId, blockId } = await ctx.params;

  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      tenantId: true,
      customerId: true,
      resultToken: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      attribution: true,
      ctaClickedAt: true,
      assessment: {
        select: {
          id: true,
          slug: true,
          title: true,
          targetUrl: true,
          resultPagePublished: true,
          tenant: { select: { id: true, slug: true, name: true } },
        },
      },
    },
  });
  if (!sub) return fallback();

  // Resolve the clicked button from the PUBLISHED page - the same source the page
  // rendered from, so the destination is always one the operator saved.
  const page = readResultPage(sub.assessment.resultPagePublished ?? null);
  const block = page.blocks.find((b) => b.id === blockId && b.type === "button");
  if (!block) return fallback();
  const config = block.config as ButtonConfig;

  const label = (config.label ?? "").trim() || null;
  const destination = stampVidapulseCtaUrl(
    normalizeHref(config.url),
    sub.customerId,
    sub.resultToken,
  );

  // Record the click first: it is the one fact that must survive even if the webhook
  // and the email both fail, because it is what the Submissions table reads.
  const ua = req.headers.get("user-agent");
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    null;
  const notifyEmail = (config.notifyEmail ?? "").trim() || null;

  let clickId: string | null = null;
  try {
    const row = await prisma.ctaClick.create({
      data: {
        submissionId: sub.id,
        assessmentId: sub.assessment.id,
        tenantId: sub.tenantId,
        blockId,
        label,
        destinationUrl: destination,
        ip: ip ? ip.slice(0, 64) : null,
        userAgent: ua ? ua.slice(0, 512) : null,
        notifyEmail,
        // No address configured is a settled outcome, not a pending one - otherwise the
        // cron would retry a notification that can never be sent.
        notifyStatus: notifyEmail ? "pending" : "skipped",
      },
      select: { id: true },
    });
    clickId = row.id;
    // First click only: the column answers "did they ask?", so a second click must not
    // move the date and make an old request look new.
    if (!sub.ctaClickedAt) {
      await prisma.submission.updateMany({
        where: { id: sub.id, ctaClickedAt: null },
        data: { ctaClickedAt: new Date() },
      });
    }
  } catch {
    /* fail-soft: a recording failure must never trap the respondent on a dead button */
  }

  // The CRM webhook. emitEvent persists the EventLog and enqueues a durable delivery
  // row per matching webhook before attempting it, so a failure here is retried by the
  // cron rather than lost - which is what "never fail the delivery" requires.
  try {
    await emitEvent(EventType.CTA_CLICKED, {
      submissionId: sub.id,
      customerId: sub.customerId,
      resultToken: sub.resultToken,
      tenant: sub.assessment.tenant,
      assessment: {
        id: sub.assessment.id,
        slug: sub.assessment.slug,
        title: sub.assessment.title,
      },
      lead: {
        firstName: sub.leadFirstName,
        lastName: sub.leadLastName,
        email: sub.leadEmail,
        mobile: sub.leadMobile,
      },
      attribution: normalizeAttribution(sub.attribution),
      // Passed explicitly: the shared builder only derives a result URL when a score
      // rides along, and this event carries none. Without it the CRM gets the booking
      // request with no way back to the result the owner has to read.
      resultUrl: ctaResultUrl(env.NEXT_PUBLIC_APP_URL, sub.assessment.slug, sub.id, sub.resultToken),
      cta: { blockId, label, destinationUrl: destination },
    });
  } catch {
    /* EventLog is the source of truth and is written inside emitEvent; still redirect */
  }

  // The owner notification, over the tenant's own SMTP. A failure leaves the row
  // pending with a backoff for the cron, so it is retried rather than dropped.
  if (clickId && notifyEmail) {
    await sendCtaNotification(clickId).catch(() => {});
  }

  return destination ? NextResponse.redirect(destination, 302) : fallback();
}
