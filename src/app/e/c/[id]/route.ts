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
 * honoured — anything else falls back to the app home, so this can't be abused as
 * an open redirect to arbitrary schemes.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const u = req.nextUrl.searchParams.get("u");
  const target = u ? decodeTrackedUrl(u) : null;

  // First-click stamp only (clickedAt: null filter), best-effort.
  await prisma.nurtureLog
    .updateMany({ where: { id, clickedAt: null }, data: { clickedAt: new Date() } })
    .catch(() => {});

  const safe = target && /^https?:\/\//i.test(target) ? target : env.NEXT_PUBLIC_APP_URL;
  return NextResponse.redirect(safe, { status: 302, headers: { "cache-control": "no-store" } });
}
