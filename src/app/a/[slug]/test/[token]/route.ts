import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { TEST_COOKIE, TEST_COOKIE_SECONDS, verifyTestToken } from "@/lib/funnel/test-link";

export const dynamic = "force-dynamic";

/**
 * Opens an owner test run: checks the signed token, sets the test cookie and drops into
 * the ordinary preview of this funnel. A bad or expired link never falls through to the
 * live funnel, because a test on the live link is exactly what this exists to prevent.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const v = verifyTestToken(token);
  const a = v ? await prisma.assessment.findFirst({ where: { id: v.assessmentId, slug }, select: { id: true } }) : null;
  if (!v || !a) {
    return new NextResponse(
      "<!doctype html><meta name=robots content=noindex><meta name=viewport content='width=device-width,initial-scale=1'>" +
        "<title>Test link expired</title><body style='font-family:system-ui;padding:2rem;max-width:32rem;margin:auto'>" +
        "<h1>This test link has expired or is not valid</h1><p>Ask Claude for a new test link for this funnel. " +
        "Please do not test on the live link: a live test sends real events to Meta.</p></body>",
      { status: 410, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  }
  // Relative on purpose: behind Railway's proxy req.url names the internal host, and a
  // tenant's funnel must stay on the tenant's own domain.
  const res = new NextResponse(null, { status: 303, headers: { location: `/a/${encodeURIComponent(slug)}?preview=1`, "cache-control": "no-store" } });
  res.cookies.set(TEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.min(TEST_COOKIE_SECONDS, Math.floor((v.expiresAt.getTime() - Date.now()) / 1000)),
  });
  return res;
}
