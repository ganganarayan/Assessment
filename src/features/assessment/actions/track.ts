"use server";

import { cookies, headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { generateId } from "@/lib/ids";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeAttribution } from "@/lib/events/payload";
import { ATTR_COOKIE } from "@/lib/attribution";
import { isBotUserAgent } from "@/lib/bots";
import { readGeoHeaders } from "@/lib/geo";
import { parseUserAgent } from "@/lib/user-agent";
import { getMetaRequestContext } from "@/lib/meta/request-context";
import { isQualificationActive } from "@/features/assessment/schemas";

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
    // hit while the log still shows it. userAgent + IP stored for audit/triage.
    const h = await headers();
    const ua = h.get("user-agent");
    const ipRaw = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || null;
    const geo = readGeoHeaders((k) => h.get(k));
    const device = parseUserAgent(ua);
    const meta = {
      isBot: isBotUserAgent(ua),
      userAgent: ua ? ua.slice(0, 512) : null,
      ip: ipRaw ? ipRaw.slice(0, 64) : null,
      country: geo.country,
      city: geo.city,
      region: geo.region,
      postalCode: geo.postalCode,
      timezone: geo.timezone,
      deviceType: device.deviceType,
      browser: device.browser,
      os: device.os,
    };

    const existing = c.get(VISITOR_COOKIE)?.value;

    if (existing) {
      // Warm visitor: bound replays per visitor (normal refreshes stay well under).
      if (!rateLimit(`pv:vid:${existing}`, 10)) return;
      await prisma.pageView.create({ data: { assessmentId: a.id, tenantId: a.tenantId, visitorId: existing, ...utm, ...meta } });
      return;
    }

    // Cold visitor: bound per-IP so a cookie-less flood can't inflate unique views.
    const ip = ipRaw || "unknown";
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

/**
 * Record that a visitor PASSED the page-1 qualification gate.
 *
 * This is the only trace such a person leaves: the opt-in (and therefore the
 * Submission) is the LAST step, so someone who qualifies and then leaves has no
 * row anywhere — and they are exactly who is worth retargeting.
 *
 * The row stores the Meta match signals captured HERE, server-side, because the
 * AssessmentAbandoned event is not fired now. It is fired hours later by the
 * sweep, once we can actually tell whether they finished — by which time the
 * browser is long gone. (A page cannot reliably report its own departure: a
 * closed tab runs no JavaScript, so an "I'm leaving" pixel would miss most of
 * the people we're trying to catch.)
 *
 * Upserted on (assessment, visitor), so re-entering the funnel refreshes the
 * signals instead of queueing a second abandonment event for the same person.
 *
 * PUBLIC server action — bounded by a rate limit, ignores bots, and requires a
 * PUBLISHED assessment with the gate actually live. Fully fail-soft.
 */
export async function recordGatePass(
  slug: string,
  visitorId: string,
  attribution?: Record<string, string>,
): Promise<void> {
  try {
    const vid = visitorId.trim().slice(0, 64);
    if (!vid) return;
    if (!rateLimit("gate:global", 5000)) return;
    if (!rateLimit(`gate:vid:${vid}`, 10)) return;

    const a = await prisma.assessment.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: { id: true, qualification: true, fireMetaCapi: true },
    });
    // No gate configured → nothing was "passed". Routed (non-ad-entry) assessments
    // deliberately tell Meta nothing, keeping its learning on the ad-entry funnel,
    // so there is no point recording an entry that may never be sent.
    if (!a || !a.fireMetaCapi || !isQualificationActive(a.qualification)) return;

    const ctx = await getMetaRequestContext();
    // A crawler executing the page's JS would otherwise become an "abandoner"
    // and pollute the retargeting audience with non-people.
    if (isBotUserAgent(ctx.clientUserAgent)) return;

    let attr = normalizeAttribution(attribution);
    if (!attr) {
      const raw = (await cookies()).get(ATTR_COOKIE)?.value;
      if (raw) {
        try {
          attr = normalizeAttribution(JSON.parse(raw));
        } catch {
          // ignore malformed cookie
        }
      }
    }

    const signals = {
      clientIp: ctx.clientIpAddress,
      userAgent: ctx.clientUserAgent,
      fbp: ctx.fbp,
      fbc: ctx.fbc,
      country: ctx.country,
      city: ctx.city,
      region: ctx.region,
      postalCode: ctx.postalCode,
      ...(attr ? { attribution: attr as unknown as Prisma.InputJsonValue } : {}),
    };

    await prisma.gateEntry.upsert({
      where: { assessmentId_visitorId: { assessmentId: a.id, visitorId: vid } },
      // A returning visitor restarts the clock: they are in the funnel again, so
      // "abandoned" should be judged from this visit, not their first one. Clearing
      // the fired stamp lets a second abandonment fire for a genuine second attempt.
      update: { ...signals, passedAt: new Date(), abandonedFiredAt: null },
      create: { assessmentId: a.id, visitorId: vid, ...signals },
    });
  } catch {
    // never surface tracking failures to the visitor
  }
}
