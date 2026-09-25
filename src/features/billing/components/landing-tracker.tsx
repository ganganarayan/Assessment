"use client";

import { useEffect, useRef } from "react";
import { recordLandingView } from "@/features/billing/actions/landing-track";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"] as const;

/**
 * Fires ONE landing page-view (with the URL's UTM params) shortly after the
 * marketing landing mounts. Guarded so React strict-mode / re-renders don't
 * double-count within a page load; the server action then bounds writes per
 * visitor/IP. Renders nothing.
 */
export function LandingTracker() {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    let attribution: Record<string, string> | undefined;
    try {
      const params = new URLSearchParams(window.location.search);
      const attr: Record<string, string> = {};
      for (const k of UTM_KEYS) {
        const v = params.get(k);
        if (v) attr[k] = v;
      }
      if (Object.keys(attr).length) attribution = attr;
    } catch {
      /* ignore */
    }
    void recordLandingView(attribution, typeof window !== "undefined" ? window.location.pathname : "/").catch(() => {});
  }, []);
  return null;
}
