import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { isBotUserAgent } from "@/lib/bots";
import { rateLimit } from "@/lib/rate-limit";
import { isTestRunFor } from "@/lib/funnel/test-link";
import type { PixelRunStatus } from "@/lib/meta/run-event";

/**
 * The browser side of the run event log: the funnel page reports each pixel event here
 * by beacon, with the same event id the server used, so a run can be read back with
 * both copies side by side and the dedup checked.
 *
 * A ROUTE because sendBeacon can only POST to a URL and survives the page closing.
 *
 * Abuse is bounded rather than prevented, because a forged call can only add a log
 * row: it never sends anything to Meta. Unknown slugs are dropped, fields are capped,
 * crawlers ignored, and one visitor is rate limited.
 */
export const dynamic = "force-dynamic";

const EVENT_NAME = /^[A-Za-z0-9_]{1,60}$/;

export async function POST(req: Request): Promise<NextResponse> {
  try {
    let body: { slug?: unknown; visitorId?: unknown; eventName?: unknown; eventId?: unknown; fired?: unknown; preview?: unknown };
    try {
      body = JSON.parse(await req.text()) as typeof body;
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const slug = typeof body.slug === "string" ? body.slug.trim().slice(0, 200) : "";
    const visitorId = typeof body.visitorId === "string" ? body.visitorId.trim().slice(0, 64) : "";
    const eventName = typeof body.eventName === "string" ? body.eventName.trim() : "";
    const eventId = typeof body.eventId === "string" && body.eventId.trim() ? body.eventId.trim().slice(0, 200) : null;
    if (!slug || !visitorId || !EVENT_NAME.test(eventName)) return NextResponse.json({ ok: false }, { status: 400 });
    if (isBotUserAgent(req.headers.get("user-agent"))) return NextResponse.json({ ok: true });
    if (!rateLimit(`px:${visitorId}`, 30)) return NextResponse.json({ ok: true });

    const a = await prisma.assessment.findFirst({ where: { slug }, select: { id: true, tenantId: true } });
    if (!a) return NextResponse.json({ ok: true });

    const testRun = await isTestRunFor(a.id);
    const fired = body.fired === true;
    const status: PixelRunStatus = fired ? "fired" : testRun ? "would_fire" : "not_loaded";
    await prisma.runEvent.create({
      data: {
        tenantId: a.tenantId,
        assessmentId: a.id,
        visitorId,
        source: "pixel",
        eventName,
        eventId,
        isPreview: testRun || body.preview === true,
        status,
        response: testRun && !fired ? "test run: the browser pixel is not loaded, so nothing reached Meta" : null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
