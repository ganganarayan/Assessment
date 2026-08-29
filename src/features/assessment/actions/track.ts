"use server";

import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { generateId } from "@/lib/ids";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeAttribution } from "@/lib/events/payload";
import { ATTR_COOKIE } from "@/lib/attribution";
import { isBotUserAgent } from "@/lib/bots";

const VISITOR_COOKIE = "a360_vid";

/**
 * Record ONE opt-in (public assessment) page view. Sets a long-lived visitor
 * cookie on first visit so "unique views" = distinct visitors. Fully fail-soft:
 * analytics must never break or slow the public page.
 *
 * This is a PUBLIC server action (directly callable), so the write is BOUNDED:
 * a global cap, a per-visitor cap (warm requests), and a per-IP cap for cold
 * (no-cookie) requests so a script sending no/random cookies can't inflate the
 * unique count or bloat the table. The cookie is only set after the slug
 * resolves to a PUBLISHED assessment, so unknown slugs can't seed cookies.
 */
export async function recordOptinView(
  slug: string,
  attribution?: Record<string, string>,
): Promise<void> {
  try {
    // Global write ceiling — blunts bulk inflation regardless of cookie/IP spoofing.
    if (!rateLimit("pv:global", 5000)) return;

    const a = await prisma.assessment.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: { id: true, tenantId: true },
    });
    if (!a) return;

    const c = await cookies();

    // Sanitize UTMs (known keys, trimmed, length-capped) so the traffic source
    // is captured on the page view itself, before any lead exists. Prefer the
    // URL params; fall back to the saved attribution cookie set in middleware.
    let attr = normalizeAttribution(attribution);
    if (!attr) {
      const raw = c.get(ATTR_COOKIE)?.value;
      if (raw) {
        try {
          attr = normalizeAttribution(JSON.parse(raw));
        } catch {
          // ignore malformed cookie
        }
      }
    }
    const utm = {
      utmSource: attr?.utm_source ?? null,
      utmMedium: attr?.utm_medium ?? null,
      utmCampaign: attr?.utm_campaign ?? null,
      utmTerm: attr?.utm_term ?? null,
      utmContent: attr?.utm_content ?? null,
      fbclid: attr?.fbclid ?? null,
      gclid: attr?.gclid ?? null,
    };

    // Classify the client: Meta's ad-review agent + crawlers execute JS (so they
    // reach this beacon) but carry no UTM — flag them so human metrics exclude the
    // hit while the log still shows it. userAgent stored for audit.
    const h = await headers();
    const ua = h.get("user-agent");
    const meta = { isBot: isBotUserAgent(ua), userAgent: ua ? ua.slice(0, 512) : null };

    const existing = c.get(VISITOR_COOKIE)?.value;

    if (existing) {
      // Warm visitor: bound replays per visitor (normal refreshes stay well under).
      if (!rateLimit(`pv:vid:${existing}`, 10)) return;
      await prisma.pageView.create({ data: { assessmentId: a.id, tenantId: a.tenantId, visitorId: existing, ...utm, ...meta } });
      return;
    }

    // Cold visitor: bound per-IP so a cookie-less flood can't inflate unique views.
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit(`pv:ip:${ip}`, 30)) return;

    const vid = generateId(24);
    c.set(VISITOR_COOKIE, vid, {
      maxAge: 60 * 60 * 24 * 365, // 1 year
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    await prisma.pageView.create({ data: { assessmentId: a.id, tenantId: a.tenantId, visitorId: vid, ...utm, ...meta } });
  } catch {
    // never surface analytics failures to the visitor
  }
}
