import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { markAbandonDue, ABANDON_GRACE_MINUTES } from "@/lib/events/abandoned";
import { scheduleAbandonSweep } from "@/lib/events/abandon-scheduler";
import { isBotUserAgent } from "@/lib/bots";

/**
 * "The visitor left the opt-in page" - fire AssessmentAbandoned now, not tomorrow.
 *
 * A ROUTE rather than a server action because this is called from `pagehide` /
 * `visibilitychange`, where the page is being torn down: only `navigator.sendBeacon`
 * is guaranteed to survive that, and a beacon can only POST to a URL. A server action
 * invoked at that moment is routinely cancelled mid-flight.
 *
 * The sweep still exists and still runs the same decision through the same function.
 * This is the fast path, not a replacement: a browser killed outright, one with JS
 * blocked, or a beacon the network drops leaves the row for the sweep to find.
 *
 * Why this cannot be abused into firing events for strangers: the body names a
 * visitor id, and an event is only ever sent for a GateEntry that already exists for
 * that id - a row this app wrote itself when that visitor passed the gate. The worst a
 * forged call achieves is firing an event the sweep would have fired anyway, once,
 * because the decision is a compare-and-swap on that row.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    // sendBeacon sends text/plain; parse defensively and never trust a field.
    const raw = await req.text();
    let body: { slug?: unknown; visitorId?: unknown };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const slug = typeof body.slug === "string" ? body.slug.trim().slice(0, 200) : "";
    const visitorId = typeof body.visitorId === "string" ? body.visitorId.trim().slice(0, 64) : "";
    if (!slug || !visitorId) return NextResponse.json({ ok: false }, { status: 400 });

    // A crawler closing a page is not a person abandoning a funnel, and the
    // retargeting audience must not fill with non-people.
    if (isBotUserAgent(req.headers.get("user-agent"))) return NextResponse.json({ ok: true });

    const entry = await prisma.gateEntry.findFirst({
      where: { visitorId, assessment: { slug } },
      select: { id: true },
    });
    // No gate pass recorded for this visitor: nothing to abandon.
    if (!entry) return NextResponse.json({ ok: true });

    // Start the clock rather than firing. See markAbandonDue: leaving this page is
    // not proof of giving up when the form asks for a number people switch apps to
    // fetch.
    await markAbandonDue(entry.id);

    // Arm the timer that takes the verdict when the grace period is up. No cron, no
    // separate service: the app is a long-lived process and one timer serves every
    // pending row. If a deploy kills it, ordinary traffic picks the rows up instead.
    scheduleAbandonSweep();

    return NextResponse.json({ ok: true, graceMinutes: ABANDON_GRACE_MINUTES });
  } catch {
    // Tracking must never surface an error to a page that is already closing.
    return NextResponse.json({ ok: true });
  }
}
