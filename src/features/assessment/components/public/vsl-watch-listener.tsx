"use client";

import { useEffect, useRef } from "react";
import { recordVslProgress } from "@/features/assessment/actions/watch";

/** Where the player is served from. Anything arriving from elsewhere is ignored. */
const VIDAPULSE_ORIGIN =
  process.env.NEXT_PUBLIC_VIDAPULSE_ORIGIN?.trim() || "https://app.vidapulse.io";

/**
 * Listen for the VidaPulse player's watch-progress messages and record them.
 *
 * The player sits in a cross-origin iframe and already talks upward (it publishes the
 * viewer ids and the session id). This picks up one more message on that same pipe -
 * see docs/vidapulse-progress-contract.md - so the owner can tell, when a call is
 * booked, whether this person has actually heard the fifteen minutes.
 *
 * 🔴 THE ORIGIN CHECK IS THE WHOLE DEFENCE.
 *
 * Those existing messages are sent with `'*'` as the target, meaning any page embedding
 * the player receives them, and by the same token any frame on THIS page can post
 * whatever it likes to us. Without checking where a message came from, a third-party
 * embed could report a completed watch for somebody who never pressed play, and the
 * number would be worse than useless - it would be believed.
 *
 * Renders nothing, and does nothing at all until a message actually arrives, so a page
 * whose video is not a VidaPulse embed carries no cost.
 */
export function VslWatchListener({
  submissionId,
  resultToken,
}: {
  submissionId: string;
  resultToken: string;
}) {
  // What we last sent, so a 10-second heartbeat on an idle player is not a write.
  const lastSent = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    if (!submissionId || !resultToken) return;

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== VIDAPULSE_ORIGIN) return;
      const d = e.data as Record<string, unknown> | null;
      if (!d || typeof d !== "object" || d.type !== "vidapulse_progress") return;

      const sessionId = typeof d.session_id === "string" ? d.session_id : "";
      const maxPct = typeof d.max_pct === "number" ? d.max_pct : NaN;
      const watchedSeconds = typeof d.watched_seconds === "number" ? d.watched_seconds : NaN;
      if (!sessionId || !Number.isFinite(maxPct) || !Number.isFinite(watchedSeconds)) return;

      // A paused player keeps sending the same numbers. Skip an unchanged report, and
      // never write more than once every five seconds for the same session.
      const key = `${sessionId}:${Math.round(maxPct * 10)}:${Math.round(watchedSeconds)}`;
      const now = Date.now();
      if (lastSent.current && lastSent.current.key === key) return;
      if (lastSent.current && now - lastSent.current.at < 5000) return;
      lastSent.current = { key, at: now };

      void recordVslProgress({
        submissionId,
        resultToken,
        sessionId,
        maxPct,
        watchedSeconds,
        duration: typeof d.duration === "number" ? d.duration : null,
        // Honoured if the player declares it; absent means per-visit, per the contract.
        scope: d.scope === "lifetime" ? "lifetime" : "session",
      }).catch(() => {
        /* the respondent is watching a video; a failed write is not their problem */
      });
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [submissionId, resultToken]);

  return null;
}
