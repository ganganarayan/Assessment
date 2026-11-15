/**
 * Thin, safe wrappers over the Meta Pixel `fbq`. No-op when the pixel isn't
 * loaded (no NEXT_PUBLIC_META_PIXEL_ID) or on the server, so callers never guard.
 */
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

/**
 * The funnel run this page belongs to, set by the assessment runner. While set, every
 * event below is also reported to the run event log by a beacon: "fired" when the pixel
 * took it, otherwise the server decides between "would have fired" (an owner test run,
 * where the pixel is deliberately not loaded) and "not loaded" (no pixel, or blocked).
 * Reporting never affects the pixel call itself.
 */
let run: { slug: string; visitorId: string | null; preview: boolean } | null = null;

export function setPixelRun(next: typeof run): void {
  run = next;
}

function report(eventName: string, eventId: string | undefined, fired: boolean): void {
  if (!run?.visitorId || typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return;
  try {
    navigator.sendBeacon(
      "/api/track/pixel",
      JSON.stringify({ slug: run.slug, visitorId: run.visitorId, eventName, eventId: eventId ?? null, fired, preview: run.preview }),
    );
  } catch {
    // a log, never the visitor's problem
  }
}

const hasPixel = (): boolean => typeof window !== "undefined" && typeof window.fbq === "function";

/**
 * `eventID` (optional) deduplicates this browser event against the server-side
 * Conversions API event of the same name - pass the id the server returned.
 */
export function pixelTrack(
  event: string,
  params?: Record<string, unknown>,
  eventID?: string,
): void {
  const fired = hasPixel();
  if (fired) {
    if (eventID) window.fbq!("track", event, params, { eventID });
    else window.fbq!("track", event, params);
  }
  report(event, eventID, fired);
}

export function pixelTrackCustom(
  event: string,
  params?: Record<string, unknown>,
  eventID?: string,
): void {
  const fired = hasPixel();
  if (fired) {
    if (eventID) window.fbq!("trackCustom", event, params, { eventID });
    else window.fbq!("trackCustom", event, params);
  }
  report(event, eventID, fired);
}
