"use client";

import { useEffect, useRef } from "react";
import { appendVidapulseId } from "@/lib/vidapulse";
import { resolveVideoSource } from "@/features/assessment/result-page/blocks";
import { recordVslProgress } from "@/features/assessment/actions/watch";

/**
 * ONE PLAYER FOR EVERY KIND OF VIDEO a result page can carry.
 *
 * Both result pages used to render an iframe and nothing else, which meant the only
 * videos that worked were the ones from a host that offers an embed. This plays what was
 * actually pasted: an embed, a YouTube or Vimeo link, an mp4 in your own bucket, or an
 * HLS playlist from your own encoder.
 *
 * WATCH PROGRESS. A VidaPulse embed reports its own, upward through postMessage, and
 * that path is untouched. A video the browser plays itself can be measured directly, so
 * mp4 and HLS now feed the same Watched column rather than being a blind spot. 🟡 A
 * YouTube or Vimeo embed reports nothing without loading their player API, so those play
 * and stay unmeasured - stated here because "the column is empty" should have a reason.
 *
 * 🟢 hls.js is imported dynamically and only for an .m3u8 source, so a page with an mp4
 * or an embed never downloads it. Safari plays HLS natively and is left alone.
 */
export function VideoPlayer({
  /** The URL or embed code as the owner pasted it. */
  source,
  vidapulseParam,
  customerId,
  /** Present on the VSL page, where a watch can be attributed to a person. */
  submissionId,
  resultToken,
  className,
}: {
  source: string | null | undefined;
  vidapulseParam?: string | null;
  customerId?: string | null;
  submissionId?: string | null;
  resultToken?: string | null;
  className?: string;
}) {
  const resolved = resolveVideoSource(source);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reported = useRef<{ pct: number; at: number }>({ pct: 0, at: 0 });
  // One id per visit, so the figures describe this watch rather than a lifetime total -
  // which is what the progress contract means by scope "session".
  const sessionId = useRef<string>("");

  const isNative = resolved?.kind === "file" || resolved?.kind === "hls";
  const canReport = isNative && !!submissionId && !!resultToken;

  // HLS needs a library everywhere except Safari, and only ever for an .m3u8.
  useEffect(() => {
    if (resolved?.kind !== "hls") return;
    const el = videoRef.current;
    if (!el) return;
    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = resolved.src;
      return;
    }
    let destroy: (() => void) | null = null;
    let cancelled = false;
    void import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !Hls.isSupported()) return;
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(resolved.src);
      hls.attachMedia(el);
      destroy = () => hls.destroy();
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [resolved?.kind, resolved?.src]);

  useEffect(() => {
    if (!canReport) return;
    const el = videoRef.current;
    if (!el) return;
    if (!sessionId.current) {
      sessionId.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    const send = (final: boolean) => {
      const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null;
      const secs = Math.floor(el.currentTime);
      const pct = duration ? Math.min(100, Math.round((el.currentTime / duration) * 100)) : 0;
      const now = Date.now();
      // Only forward progress, and never more than once every ten seconds: a player
      // fires timeupdate four times a second, and none of those is worth a write.
      if (!final && (pct <= reported.current.pct || now - reported.current.at < 10_000)) return;
      if (pct <= 0) return;
      reported.current = { pct, at: now };
      void recordVslProgress({
        submissionId: submissionId ?? "",
        resultToken: resultToken ?? "",
        sessionId: sessionId.current,
        maxPct: pct,
        watchedSeconds: secs,
        duration,
        scope: "session",
      });
    };

    const onTime = () => send(false);
    const onEnded = () => send(true);
    const onHide = () => {
      if (document.visibilityState === "hidden") send(true);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnded);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [canReport, submissionId, resultToken]);

  if (!resolved) return null;

  const frame = `relative w-full overflow-hidden rounded-xl ${className ?? ""}`;

  if (resolved.kind === "iframe") {
    // Carry the opaque VidaPulse id into the embed (identity bridge). A no-op for any
    // player that ignores the parameter, and for a page with tracking off.
    const src = appendVidapulseId(resolved.src, vidapulseParam ?? null, customerId ?? null);
    return (
      <div className={frame} style={{ paddingTop: "56.25%" }}>
        <iframe
          src={src}
          title="Video"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
        />
      </div>
    );
  }

  return (
    <div className={frame}>
      <video
        ref={videoRef}
        {...(resolved.kind === "file" ? { src: resolved.src } : {})}
        controls
        playsInline
        preload="metadata"
        className="h-auto w-full rounded-xl bg-black"
      />
    </div>
  );
}
