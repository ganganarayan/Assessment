"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { nudgeAbandonSweep } from "@/lib/events/abandon-scheduler";
import { generateId } from "@/lib/ids";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeAttribution } from "@/lib/events/payload";
import { ATTR_COOKIE } from "@/lib/attribution";
import { isBotUserAgent } from "@/lib/bots";
import { readGeoHeaders } from "@/lib/geo";
import { parseUserAgent } from "@/lib/user-agent";
import { getMetaRequestContext } from "@/lib/meta/request-context";
import { sendCapiEventVerbose } from "@/lib/meta/send";
import { metaEventOn } from "@/features/assessment/meta-events";
import { bumpFunnelEventCount } from "@/lib/meta/funnel-count";
import { tenantCan } from "@/lib/billing/plan-resolve";
import { GATE_DQ_AUDIENCE_REFRESH_MS } from "@/lib/gate-flag";
import { env } from "@/lib/env";
import { randomUUID } from "crypto";
import { isQualificationActive, disqualifiedContentSchema, GATE_DISQUALIFIED_EVENT } from "@/features/assessment/schemas";

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
    // Every funnel visit is also a chance to clear an abandon verdict that fell due
    // while nothing was listening - after a deploy, say, which drops pending timers.
    // Throttled to once a minute inside, so this costs a busy funnel one query a
    // minute and not one per visit.
    nudgeAbandonSweep();
    // Global write ceiling - blunts bulk inflation regardless of cookie/IP spoofing.
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
    // reach this beacon) but carry no UTM - flag them so human metrics exclude the
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
 * row anywhere - and they are exactly who is worth retargeting.
 *
 * The row stores the Meta match signals captured HERE, server-side, because the
 * AssessmentAbandoned event is not fired now. It is fired hours later by the
 * sweep, once we can actually tell whether they finished - by which time the
 * browser is long gone. (A page cannot reliably report its own departure: a
 * closed tab runs no JavaScript, so an "I'm leaving" pixel would miss most of
 * the people we're trying to catch.)
 *
 * Upserted on (assessment, visitor), so re-entering the funnel refreshes the
 * signals instead of queueing a second abandonment event for the same person.
 *
 * PUBLIC server action - bounded by a rate limit, ignores bots, and requires a
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
      select: { id: true, tenantId: true, qualification: true, fireMetaCapi: true },
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
      update: { ...signals, tenantId: a.tenantId, passedAt: new Date(), abandonedFiredAt: null },
      create: { assessmentId: a.id, tenantId: a.tenantId, visitorId: vid, ...signals },
    });
  } catch {
    // never surface tracking failures to the visitor
  }
}

/** Payload for one gate rejection. `repeat` is decided by the funnel (a stored
 *  rejection flag short-circuits the visitor to the exit page without re-answering),
 *  which is why the ids are absent on those rows. */
const gateDisqualificationSchema = z.object({
  questionId: z.string().trim().min(1).max(60).optional(),
  optionId: z.string().trim().min(1).max(60).optional(),
  repeat: z.boolean().default(false),
  /** First-party visitor id (the same one the opt-in sends) → CAPI external_id, so a
   *  rejection and a later registration match the same person in Meta. */
  externalId: z.string().trim().min(1).max(64).optional(),
});

export type GateDisqualificationInput = z.input<typeof gateDisqualificationSchema>;

/**
 * Record ONE qualification-gate rejection - the mirror of recordGatePass, for the
 * visitors the gate turns away.
 *
 * The gate deliberately creates no lead, submission or result, so without this row a
 * disqualified visitor is invisible to every in-app metric while Meta still counts the
 * exclusion event - which is how a funnel reads 0 in the app and non-zero in Meta.
 *
 * ASSESSMENT FUNNEL ONLY. The SaaS signup and subscription paths have no gate and
 * must never call this.
 *
 * Same contract as recordOptinView: a PUBLIC server action, so the write is bounded
 * (global / per-visitor / per-IP caps), bot-flagged, and fully fail-soft.
 */
export async function recordGateDisqualification(
  slug: string,
  input: GateDisqualificationInput,
  attribution?: Record<string, string>,
): Promise<void> {
  try {
    if (!rateLimit("gdq:global", 5000)) return;

    const parsed = gateDisqualificationSchema.safeParse(input);
    if (!parsed.success) return; // malformed payload - never a reason to disturb the visitor
    const { questionId, optionId, repeat, externalId } = parsed.data;

    const a = await prisma.assessment.findFirst({
      where: { slug, status: "PUBLISHED" },
      // disqualified/qualification/fireMetaCapi decide whether GateDisqualified is
      // sent from here - the browser no longer fires it.
      select: { id: true, slug: true, title: true, tenantId: true, disqualifiedContent: true, qualification: true, fireMetaCapi: true, metaEvents: true },
    });
    if (!a) return;

    const c = await cookies();

    // Prefer the URL's UTMs, else the last-touch cookie - so a gate that rejects an
    // entire campaign is attributable even though no lead was ever created.
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

    const h = await headers();
    const ua = h.get("user-agent");
    const ipRaw = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || null;
    const geo = readGeoHeaders((k) => h.get(k));
    const device = parseUserAgent(ua);
    const meta = {
      questionId: questionId ?? null,
      optionId: optionId ?? null,
      repeat,
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
    let vid: string;
    if (existing) {
      if (!rateLimit(`gdq:vid:${existing}`, 10)) return;
      vid = existing;
    } else {
      const ip = ipRaw || "unknown";
      if (!rateLimit(`gdq:ip:${ip}`, 30)) return;

      // Cold visitor (gate answered before the view beacon landed, or a blocked cookie):
      // seed the same visitor id the rest of the funnel uses. Safe - the slug already
      // resolved to a PUBLISHED assessment, so unknown slugs can't seed cookies.
      vid = generateId(24);
      c.set(VISITOR_COOKIE, vid, {
        maxAge: 60 * 60 * 24 * 365, // 1 year
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    }

    const row = await prisma.gateDisqualification.create({
      data: { assessmentId: a.id, tenantId: a.tenantId, visitorId: vid, ...utm, ...meta },
      select: { id: true },
    });

    // The exclusion audience is fed from HERE now (server CAPI), not the browser.
    await fireGateDisqualified(a, vid, row.id, meta.isBot, externalId ?? null);
  } catch {
    // never surface analytics failures to the visitor
  }
}

/**
 * Send GateDisqualified to Meta server-side, and COUNT the firing.
 *
 * Server CAPI, not the browser pixel: a rejection carries no PII (no lead is ever
 * created), and Meta does not need any - client IP, user agent, _fbp/_fbc and the
 * first-party external_id are match keys in their own right. Firing from here also
 * survives ad blockers and gives an auditable count, which a browser event could not.
 *
 * Fires at most once per visitor per audience-refresh window, exactly as the old
 * localStorage rule did (GATE_DQ_AUDIENCE_REFRESH_MS): a fresh rejection fires, a
 * revisit stays silent until membership is worth renewing. The decision now reads
 * `capiFiredAt` on this visitor's earlier rows, so a cleared browser cannot cause a
 * re-fire and an ad-blocked browser cannot cause a miss.
 *
 * Fail-soft throughout - the visitor is already looking at the exit page.
 */
async function fireGateDisqualified(
  a: {
    id: string;
    slug: string;
    title: string;
    tenantId: string | null;
    disqualifiedContent: unknown;
    qualification: unknown;
    fireMetaCapi: boolean;
    metaEvents: unknown;
  },
  visitorId: string,
  rowId: string,
  isBot: boolean,
  externalId: string | null,
): Promise<void> {
  try {
    // A crawler executing the page's JS must never enter the exclusion audience.
    if (isBot) return;
    // Routed (non-ad-entry) assessments tell Meta nothing - same rule as the opt-in.
    if (!metaEventOn(a.fireMetaCapi, a.metaEvents, "gateDisqualified")) return;
    if (!isQualificationActive(a.qualification)) return;
    const dq = disqualifiedContentSchema.safeParse(a.disqualifiedContent ?? {});
    if (!dq.success || !dq.data.fireDisqualifiedEvent) return;

    // Already reported recently? Then Meta knows: staying silent is what keeps the
    // event count equal to the number of people, not the number of visits.
    const last = await prisma.gateDisqualification.findFirst({
      where: { assessmentId: a.id, visitorId, capiFiredAt: { not: null } },
      orderBy: { capiFiredAt: "desc" },
      select: { capiFiredAt: true },
    });
    if (last?.capiFiredAt && Date.now() - last.capiFiredAt.getTime() < GATE_DQ_AUDIENCE_REFRESH_MS) return;

    // Billing gate: server-side CAPI is a Growth+ capability, same as every other
    // lifecycle event. Platform/Gita scope (tenantId null) passes.
    if (!(await tenantCan(a.tenantId, "capi"))) return;

    const ctx = await getMetaRequestContext();
    const res = await sendCapiEventVerbose(
      {
        eventName: GATE_DISQUALIFIED_EVENT,
        eventId: randomUUID(),
        eventTimeMs: Date.now(),
        eventSourceUrl: `${env.NEXT_PUBLIC_APP_URL}/a/${a.slug}`,
        user: {
          ...ctx,
          state: ctx.region,
          zip: ctx.postalCode,
          // No email/phone/name exists for a rejected visitor - and none is needed.
          externalId: externalId ?? visitorId,
        },
        customData: { assessment: a.slug, assessment_name: a.title },
      },
      a.tenantId,
    );

    // Stamp only on success, so a failed send is retried on the next rejection
    // instead of silently marking this visitor as reported.
    if (res.ok) {
      await prisma.gateDisqualification.update({ where: { id: rowId }, data: { capiFiredAt: new Date() } }).catch(() => {});
    }
    await bumpFunnelEventCount({ assessmentId: a.id, tenantId: a.tenantId, eventName: GATE_DISQUALIFIED_EVENT, ok: res.ok });
  } catch {
    // never surface tracking failures to the visitor
  }
}

/**
 * Record that this visitor REACHED the opt-in form.
 *
 * This is the fact that separates the two ways of losing someone who passed the gate:
 * they saw the ask and walked away (AssessmentAbandoned), or they never got that far
 * (GateIncomplete). One has refused the offer, the other has not heard it, and an ad
 * written for one is wrong for the other.
 *
 * Recorded when the form is SHOWN rather than inferred from the departure beacon,
 * because a beacon can be lost - JS blocked, the browser killed outright - and a lost
 * beacon would silently file a refusal as a never-saw-it. This call happens while the
 * page is alive and healthy, so it is the reliable half.
 *
 * Only ever sets the column, never clears it: returning to the form a second time does
 * not un-see it the first time.
 *
 * PUBLIC server action - rate limited, fail-soft, and a no-op for a visitor with no
 * gate entry (nothing to attach the fact to).
 */
export async function recordOptinSeen(slug: string, visitorId: string): Promise<void> {
  try {
    const vid = visitorId.trim().slice(0, 64);
    if (!vid) return;
    if (!rateLimit("optinseen:global", 5000)) return;
    if (!rateLimit(`optinseen:vid:${vid}`, 10)) return;

    await prisma.gateEntry.updateMany({
      where: { visitorId: vid, optinSeenAt: null, assessment: { slug, status: "PUBLISHED" } },
      data: { optinSeenAt: new Date() },
    });
  } catch {
    // never surface tracking failures to the visitor
  }
}
