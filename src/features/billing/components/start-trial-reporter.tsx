"use client";

import { useEffect, useRef } from "react";
import { trackStartTrial } from "@/features/billing/actions/platform-track";
import { firePlatformBrowserEvent } from "@/lib/meta/platform-pixel-client";

/**
 * Report StartTrial the first time a workspace is opened.
 *
 * Mounted in the workspace layout rather than on one page, because "first time they
 * reach the app" is not a particular screen - a new signup lands on Assessments, a
 * returning link may land anywhere.
 *
 * The decision is entirely server-side: the action claims a per-workspace stamp with a
 * compare-and-swap and returns nulls when there is nothing to fire, which is every
 * visit after the first. This component only carries the browser half of an event the
 * server has already decided to send, so two tabs, a refresh, or a remount cannot
 * produce a second trial.
 *
 * The event id comes from that same call, so the pixel event and the Conversions API
 * event deduplicate into one conversion.
 */
export function StartTrialReporter() {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    void (async () => {
      try {
        const { eventId, pixelId } = await trackStartTrial();
        if (!eventId) return; // already reported for this workspace
        firePlatformBrowserEvent(pixelId, "StartTrial", {}, eventId);
      } catch {
        /* tracking must never disturb the app */
      }
    })();
  }, []);

  return null;
}
