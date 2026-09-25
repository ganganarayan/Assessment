"use server";

import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { generateId } from "@/lib/ids";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeAttribution } from "@/lib/events/payload";
import { ATTR_COOKIE } from "@/lib/attribution";
import { isBotUserAgent } from "@/lib/bots";
import { readGeoHeaders } from "@/lib/geo";
import { parseUserAgent } from "@/lib/user-agent";

// Shared with the assessment funnel's visitor cookie so a person who lands, browses
// the marketing site, and then hits an assessment keeps one visitor identity.
const VISITOR_COOKIE = "a360_vid";

/**
 * Record ONE Assess360 MARKETING landing page view (the top of the SaaS funnel),
 * with UTM captured from the URL → last-touch cookie. Mirrors recordOptinView but
 * writes PlatformPageView (no assessment). Fully fail-soft + write-bounded (global /
 * per-visitor / per-IP caps) so analytics never breaks or slows the landing.
 */
export async function recordLandingView(attribution?: Record<string, string>, path?: string): Promise<void> {
  try {
    if (!rateLimit("plv:global", 5000)) return;

    const c = await cookies();

    let attr = normalizeAttribution(attribution);
    if (!attr) {
      const raw = c.get(ATTR_COOKIE)?.value;
      if (raw) {
        try {
          attr = normalizeAttribution(JSON.parse(raw));
        } catch {
          /* ignore malformed cookie */
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

    const h = await headers();
    const ua = h.get("user-agent");
    const ipRaw = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || null;
    const geo = readGeoHeaders((k) => h.get(k));
    const device = parseUserAgent(ua);
    const referrer = h.get("referer");
    let referrerHost: string | null = null;
    if (referrer) {
      try {
        referrerHost = new URL(referrer).host.slice(0, 120);
      } catch {
        /* malformed referrer */
      }
    }
    const meta = {
      path: path ? path.slice(0, 200) : "/",
      referrerHost,
      isBot: isBotUserAgent(ua),
      userAgent: ua ? ua.slice(0, 512) : null,
      ip: ipRaw ? ipRaw.slice(0, 64) : null,
      country: geo.country,
      city: geo.city,
      region: geo.region,
      deviceType: device.deviceType,
      browser: device.browser,
      os: device.os,
    };

    const existing = c.get(VISITOR_COOKIE)?.value;
    if (existing) {
      if (!rateLimit(`plv:vid:${existing}`, 10)) return;
      await prisma.platformPageView.create({ data: { visitorId: existing, ...utm, ...meta } });
      return;
    }

    const ip = ipRaw || "unknown";
    if (!rateLimit(`plv:ip:${ip}`, 30)) return;

    const vid = generateId(24);
    c.set(VISITOR_COOKIE, vid, { maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: "lax", path: "/" });
    await prisma.platformPageView.create({ data: { visitorId: vid, ...utm, ...meta } });
  } catch {
    /* never surface analytics failures to the visitor */
  }
}
