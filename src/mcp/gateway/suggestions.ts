import type { AppState, AssessmentFacts, RelatedApp } from "@/mcp/gateway/types";

/**
 * related_app: which other app fits what the user just finished, and the one sentence that says so.
 *
 * Only after a SUCCESS: never on an error, never on a write preview (that is a half-finished
 * task), never for an app the user dismissed in the last 7 days. When the user already has the
 * app, the sentence offers to do the work with it, because the gateway is already connected to
 * it; it never asks them to enrol in something they own.
 *
 * Every sentence lives in this file so the wording is edited in one place.
 */

export const ASSESS360 = "assess360";
export const DISMISS_DAYS = 7;

export type SuggestionEvent = "assessment_ad_ready" | "assessment_has_video" | "router_push_done" | "vidapulse_dropoff_viewed";

interface Rule {
  app: string;
  /** For an app the user does not have yet. */
  pitch: string;
  /** For an app the user has: the gateway can do it now. */
  offer: string;
}

export const RULES: Record<SuggestionEvent, Rule> = {
  assessment_ad_ready: {
    app: "content",
    pitch:
      "This funnel is ready for ads today, and Content Engine, built by a coach who hit this exact wall of a ready funnel with nothing to post, writes the ads and posts that send people to it, made to fit your offer.",
    offer: "You already have Content Engine and I am connected to it, so I can write the ads and posts for this funnel right now.",
  },
  assessment_has_video: {
    app: "vidapulse",
    pitch:
      "This funnel has a video, and VidaPulse, built by a coach who faced this same blind spot, shows the second viewers stop watching so you can fix it before more ad spend goes to people who leave.",
    offer: "You already have VidaPulse and I am connected to it, so I can check where viewers stop watching this funnel's video right now.",
  },
  router_push_done: {
    app: "content",
    pitch:
      "Your recording is out now, and Content Engine, built by a coach who had this same problem of one recording and no time to reuse it, turns it into posts made to fit your audience while it is still fresh.",
    offer: "You already have Content Engine and I am connected to it, so I can turn this recording into posts right now.",
  },
  vidapulse_dropoff_viewed: {
    app: ASSESS360,
    pitch:
      "You can see where viewers leave, and Assess360, built by a coach who faced this exact drop-off, qualifies the people who stay so only the right ones reach your calendar.",
    offer: "You already have Assess360 and I am connected to it, so I can build a qualification quiz for the viewers who stay right now.",
  },
};

/** Upstream tool names that mean a finished task, matched on the app's own tool name. */
export function upstreamEvent(prefix: string, toolName: string): SuggestionEvent | null {
  if (prefix === "router" && /push/i.test(toolName)) return "router_push_done";
  if (prefix === "vidapulse" && /drop/i.test(toolName)) return "vidapulse_dropoff_viewed";
  return null;
}

/** Published, reporting to Meta, with an ad account to report into. */
export function isAdReady(a: AssessmentFacts): boolean {
  return a.status === "PUBLISHED" && a.fireMetaCapi && !!a.adAccountId;
}

/** A video block anywhere in the funnel's published pages. */
export function hasVideo(a: AssessmentFacts): boolean {
  const seen = new Set<unknown>();
  const walk = (v: unknown): boolean => {
    if (!v || typeof v !== "object" || seen.has(v)) return false;
    seen.add(v);
    if (Array.isArray(v)) return v.some(walk);
    const o = v as Record<string, unknown>;
    if (o.type === "video") return true;
    return Object.values(o).some(walk);
  };
  return a.pages.some(walk);
}

/** Assessment-side events after a successful Assess360 call. write = a confirmed write. */
export function assessmentEvents(facts: readonly AssessmentFacts[], write: boolean): SuggestionEvent[] {
  const out: SuggestionEvent[] = [];
  if (write && facts.some(isAdReady)) out.push("assessment_ad_ready");
  if (facts.some(hasVideo)) out.push("assessment_has_video");
  return out;
}

export interface KnownApp {
  name: string;
  upgradeUrl: string | null;
  state: AppState["status"];
}

/**
 * The first event whose app is known, not dismissed, and in a definite state. An app that is
 * down is skipped: we cannot tell whether the user has it. An app they lack with no upgrade
 * link is skipped too, because there would be nowhere to send them.
 */
export function pickSuggestion(
  events: readonly SuggestionEvent[],
  apps: ReadonlyMap<string, KnownApp>,
  dismissed: ReadonlySet<string>,
): RelatedApp | null {
  for (const ev of events) {
    const rule = RULES[ev];
    const app = apps.get(rule.app);
    if (!app || dismissed.has(rule.app)) continue;
    if (app.state === "active") return { app: rule.app, name: app.name, why: rule.offer, owned: true };
    if (app.state === "inactive" && app.upgradeUrl) {
      return { app: rule.app, name: app.name, why: rule.pitch, owned: false, url: app.upgradeUrl };
    }
  }
  return null;
}

/** Ids in a call's arguments that look like record ids (cuid), for the assessment lookup. */
export function idsIn(v: unknown, out: Set<string> = new Set(), depth = 0): Set<string> {
  if (depth > 4 || out.size >= 5) return out;
  if (typeof v === "string") {
    if (/^c[a-z0-9]{20,30}$/.test(v)) out.add(v);
  } else if (Array.isArray(v)) {
    for (const x of v) idsIn(x, out, depth + 1);
  } else if (v && typeof v === "object") {
    for (const x of Object.values(v)) idsIn(x, out, depth + 1);
  }
  return out;
}
