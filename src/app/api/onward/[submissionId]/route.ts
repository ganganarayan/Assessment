import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { appendVidapulseId, stampVidapulseCtaUrl } from "@/lib/vidapulse";
import { vidapulseParamForTenant } from "@/lib/events/completion";
import { isPlatformHost } from "@/lib/seo/urls";

/**
 * Onward redirect for the "Show results on assess360" flow. The result page's
 * onward button ("Upgrade my state" etc.) points HERE instead of straight at the
 * external resources page, so the click is TRACKED server-side - it bumps the VSL
 * counter (resultFetchCount), the same counter the destination connector bumps for
 * the other audiences - before we 302 the respondent on, with their result token
 * appended. Nothing is required on the destination page (no code, no connector).
 *
 * The destination is the assessment's saved resultsContinueUrl (operator-set, never
 * request input), so there is no open-redirect surface. Fail-soft: any tracking
 * error still forwards the respondent.
 */
export const dynamic = "force-dynamic";

/** Append lead details to a destination we own. Returns the url untouched otherwise. */
function withLeadPrefill(
  dest: string,
  requestHost: string,
  lead: { email: string | null; name: string | null },
): string {
  if (!lead.email && !lead.name) return dest;
  try {
    const u = new URL(dest);
    const ours = u.host.toLowerCase() === requestHost.toLowerCase() || isPlatformHost(u.host);
    if (!ours) return dest;
    if (lead.email) u.searchParams.set("email", lead.email);
    if (lead.name) u.searchParams.set("name", lead.name);
    return u.toString();
  } catch {
    // Unparseable url: leave it exactly as the operator saved it.
    return dest;
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await ctx.params;
  const requestHost = (() => {
    try {
      return new URL(req.url).host;
    } catch {
      return "";
    }
  })();

  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      resultToken: true,
      customerId: true,
      leadEmail: true,
      leadFirstName: true,
      leadLastName: true,
      assessment: { select: { resultsContinueUrl: true, tenantId: true } },
    },
  });

  const target = sub?.assessment.resultsContinueUrl?.trim() || null;
  // No submission, or no onward URL configured - nothing to forward to.
  if (!sub || !target) return NextResponse.redirect(env.NEXT_PUBLIC_APP_URL, 302);

  // Record the onward click as a VSL hit, and stamp the first-view time once.
  // Awaited (a redirect isn't latency-critical) so the count records reliably;
  // fail-soft so a DB hiccup never traps the respondent on a dead button.
  try {
    await prisma.submission.update({
      where: { id: submissionId },
      data: { resultFetchCount: { increment: 1 } },
    });
    await prisma.submission.updateMany({
      where: { id: submissionId, resultFetchedAt: null },
      data: { resultFetchedAt: new Date() },
    });
  } catch {
    /* fail-soft: still redirect below */
  }

  // Append the person's token so it rides along to the destination (a bonus for
  // later correlation - NOT the tracking mechanism). Guard a malformed URL.
  let dest = target;
  if (sub.resultToken) {
    try {
      const u = new URL(target);
      u.searchParams.set("t", sub.resultToken);
      // r = the same result token: our builder forwards ?r= onto the VidaPulse iframe
      // src, mapping the viewer even in FB/IG in-app browsers (no referrer).
      u.searchParams.set("r", sub.resultToken);
      dest = u.toString();
    } catch {
      /* keep target as-is */
    }
  }
  // Carry the opaque customerId (VidaPulse `cid`) too, so the VSL on the destination
  // page can bind this viewer - matching the token-gated result link. No-op when off.
  dest = appendVidapulseId(dest, await vidapulseParamForTenant(sub.assessment.tenantId), sub.customerId);
  // When the onward URL IS a VidaPulse CTA tracking link, make sure it carries the
  // canonical `cid` too: the append above uses the tenant's (renameable) embed param,
  // which VidaPulse's CTA endpoint does not read. No-op for every other destination.
  dest = stampVidapulseCtaUrl(dest, sub.customerId, sub.resultToken) ?? dest;

  // Hand the respondent's own email and name forward, but ONLY to a page we serve.
  //
  // This is what lets the result page's button land on /sign-up with the form already
  // filled, instead of asking someone to retype the address they gave us two screens ago.
  //
  // The host check is the point, not a formality. resultsContinueUrl is operator-set and
  // can name any site, and putting a respondent's email in a query string sends it into
  // somebody else's access logs, their analytics and their referrer headers. So the
  // parameters are added only when the destination is the host serving this request or
  // the platform's own domain, and are silently skipped everywhere else.
  dest = withLeadPrefill(dest, requestHost, {
    email: sub.leadEmail,
    name: [sub.leadFirstName, sub.leadLastName].filter(Boolean).join(" ").trim() || null,
  });

  return NextResponse.redirect(dest, 302);
}
