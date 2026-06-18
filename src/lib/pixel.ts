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
 * `eventID` (optional) deduplicates this browser event against the server-side
 * Conversions API event of the same name — pass the id the server returned.
 */
export function pixelTrack(
  event: string,
  params?: Record<string, unknown>,
  eventID?: string,
): void {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    if (eventID) window.fbq("track", event, params, { eventID });
    else window.fbq("track", event, params);
  }
}

export function pixelTrackCustom(
  event: string,
  params?: Record<string, unknown>,
  eventID?: string,
): void {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    if (eventID) window.fbq("trackCustom", event, params, { eventID });
    else window.fbq("trackCustom", event, params);
  }
}
