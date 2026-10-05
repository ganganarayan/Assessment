// Deliberately NOT `server-only`: the Railway cron (tsx scripts/sweep-abandoned.ts)
// retries these notifications, and that process runs outside Next, where the
// `server-only` package does not resolve at all.
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/nurture/send";
import { formatIST } from "@/lib/date";
import { ctaResultUrl } from "@/lib/cta/result-url";

/**
 * "Someone asked for a call" - the owner notification for a booking-CTA click.
 *
 * The thank-you page lives in the CRM, so this email is how the owner learns who to
 * evaluate. That makes it the wrong thing to fire and forget: every attempt is stamped
 * on the CtaClick row, and a failure stays `pending` with a backoff so the cron retries
 * it. Only once the schedule is exhausted is it marked `dead` - visible, not silent.
 *
 * Confirmation to the RESPONDENT is deliberately not sent here: it goes from the CRM,
 * off the `booking_requested` webhook, so it comes from the owner's sending identity
 * rather than the app's transactional SMTP.
 */

// Delay before the next attempt, indexed by the attempt that just failed (1-based).
// Mirrors the webhook schedule so both give up at the same point.
const BACKOFF_MS = [2, 5, 15, 30, 60].map((m) => m * 60_000);

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function row(label: string, value: string | null): string {
  return `<tr><td style="padding:6px 12px 6px 0;color:#555;white-space:nowrap">${esc(label)}</td><td style="padding:6px 0"><strong>${esc(value || "-")}</strong></td></tr>`;
}

/**
 * Send (or retry) the notification for one CtaClick. Claims the row first so an
 * overlapping cron run and inline call cannot both send. Never throws.
 */
export async function sendCtaNotification(clickId: string): Promise<void> {
  const now = new Date();

  // Lease-claim a due, pending row: push the next attempt forward so a concurrent
  // worker skips it. If this process dies mid-send the row becomes due again on its
  // own, so there is no stuck state to reclaim.
  const claim = await prisma.ctaClick.updateMany({
    where: {
      id: clickId,
      notifyStatus: "pending",
      OR: [{ notifyNextAttemptAt: null }, { notifyNextAttemptAt: { lte: now } }],
    },
    data: { notifyNextAttemptAt: new Date(now.getTime() + 120_000) },
  });
  if (claim.count === 0) return;

  const click = await prisma.ctaClick.findUnique({
    where: { id: clickId },
    include: {
      submission: {
        select: {
          id: true,
          leadFirstName: true,
          leadLastName: true,
          leadEmail: true,
          leadMobile: true,
          resultToken: true,
          customerId: true,
          assessment: { select: { slug: true, title: true } },
        },
      },
    },
  });
  if (!click || !click.notifyEmail) return;

  const s = click.submission;
  const name = [s.leadFirstName, s.leadLastName].filter(Boolean).join(" ") || null;
  // The FULL internal result page - what the owner reads to decide whether this person
  // qualifies. Token-bearing, so it opens without a sign-in.
  const resultUrl = ctaResultUrl(env.NEXT_PUBLIC_APP_URL, s.assessment.slug, s.id, s.resultToken);

  const subject = `Call requested: ${name ?? s.leadEmail ?? "someone"} - ${s.assessment.title}`;
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <p style="font-size:16px;margin:0 0 4px"><strong>${esc(name ?? "A respondent")}</strong> asked to book a call.</p>
    <p style="color:#555;margin:0 0 16px;font-size:14px">${esc(click.label ?? "Booking CTA")} &middot; ${esc(formatIST(click.createdAt))} IST</p>
    <table style="border-collapse:collapse;font-size:14px">
      ${row("Name", name)}
      ${row("Email", s.leadEmail)}
      ${row("Phone", s.leadMobile)}
      ${row("Assessment", s.assessment.title)}
      ${row("Customer id", s.customerId)}
    </table>
    <p style="margin:20px 0">
      <a href="${esc(resultUrl)}" style="background:#16a34a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">Open their full result page</a>
    </p>
    <p style="font-size:13px;color:#555">If the button doesn't work, paste this link into your browser:<br>
      <a href="${esc(resultUrl)}">${esc(resultUrl)}</a></p>
  </div>`;

  const error = await sendEmail(click.tenantId, click.notifyEmail, subject, html).catch((e: unknown) =>
    e instanceof Error ? e.message : String(e),
  );

  if (!error) {
    await prisma.ctaClick
      .update({
        where: { id: clickId },
        data: {
          notifyStatus: "sent",
          notifyAttempts: { increment: 1 },
          notifiedAt: new Date(),
          notifyNextAttemptAt: null,
          notifyError: null,
        },
      })
      .catch(() => {});
    return;
  }

  const attempt = click.notifyAttempts + 1;
  const backoff = BACKOFF_MS[attempt - 1];
  await prisma.ctaClick
    .update({
      where: { id: clickId },
      data:
        backoff === undefined
          ? { notifyStatus: "dead", notifyAttempts: attempt, notifyNextAttemptAt: null, notifyError: error.slice(0, 500) }
          : {
              notifyStatus: "pending",
              notifyAttempts: attempt,
              notifyNextAttemptAt: new Date(Date.now() + backoff),
              notifyError: error.slice(0, 500),
            },
    })
    .catch(() => {});
}

/** Retry every due notification (the cron). */
export async function sweepCtaNotifications(limit = 100): Promise<{ processed: number }> {
  const due = await prisma.ctaClick.findMany({
    where: { notifyStatus: "pending", notifyNextAttemptAt: { lte: new Date() } },
    orderBy: { notifyNextAttemptAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const r of due) {
    await sendCtaNotification(r.id).catch(() => {});
  }
  return { processed: due.length };
}
