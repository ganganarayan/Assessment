import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { decodeTrackedUrl } from "@/lib/nurture/tracking";

export const dynamic = "force-dynamic";

/**
 * Email click redirect. A tracked link in a nurture email points here:
 *   /e/c/<nurtureLogId>?u=<base64url original URL>
 * We stamp NurtureLog.clickedAt on the FIRST click (best-effort, never blocks the
 * redirect), then 302 to the original URL. Only absolute http(s) destinations are
 * honoured - anything else falls back to the app home, so this can't be abused as
 * an open redirect to arbitrary schemes.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const u = req.nextUrl.searchParams.get("u");
  const target = u ? decodeTrackedUrl(u) : null;

  // First-click stamp only (clickedAt: null filter), best-effort.
  const stamped = await prisma.nurtureLog
    .updateMany({ where: { id, clickedAt: null }, data: { clickedAt: new Date() } })
    .catch(() => ({ count: 0 }));

  /**
   * If this email came from an automation, credit the MESSAGE that earned the click.
   *
   * Counted here rather than worked out when the stats page is read, because the join
   * that would answer it (every send row, then every log row behind them) is the kind of
   * query that is fine for one workspace and hopeless for a thousand. One extra write on
   * the first click of an email buys an O(1) read forever.
   *
   * Guarded on `stamped.count`, so only the first click counts and a link pasted into a
   * group chat cannot inflate the number.
   */
  if (stamped.count > 0) {
    await prisma.automationSend
      .findFirst({ where: { nurtureLogId: id }, select: { actionId: true } })
      .then((send) =>
        send
          ? prisma.automationAction.update({
              where: { id: send.actionId },
              data: { clickCount: { increment: 1 } },
            })
          : null,
      )
      .catch(() => {});
  }

  const safe = target && /^https?:\/\//i.test(target) ? target : env.NEXT_PUBLIC_APP_URL;
  return NextResponse.redirect(safe, { status: 302, headers: { "cache-control": "no-store" } });
}
