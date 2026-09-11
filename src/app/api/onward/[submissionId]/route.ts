import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";

/**
 * Onward redirect for the "Show results on assess360" flow. The result page's
 * onward button ("Upgrade my state" etc.) points HERE instead of straight at the
 * external resources page, so the click is TRACKED server-side — it bumps the VSL
 * counter (resultFetchCount), the same counter the destination connector bumps for
 * the other audiences — before we 302 the respondent on, with their result token
 * appended. Nothing is required on the destination page (no code, no connector).
 *
 * The destination is the assessment's saved resultsContinueUrl (operator-set, never
 * request input), so there is no open-redirect surface. Fail-soft: any tracking
 * error still forwards the respondent.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await ctx.params;

  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      resultToken: true,
      assessment: { select: { resultsContinueUrl: true } },
    },
  });

  const target = sub?.assessment.resultsContinueUrl?.trim() || null;
  // No submission, or no onward URL configured — nothing to forward to.
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
  // later correlation — NOT the tracking mechanism). Guard a malformed URL.
  let dest = target;
  if (sub.resultToken) {
    try {
      const u = new URL(target);
      u.searchParams.set("t", sub.resultToken);
      dest = u.toString();
    } catch {
      /* keep target as-is */
    }
  }

  return NextResponse.redirect(dest, 302);
}
