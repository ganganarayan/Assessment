/**
 * Thin, safe wrappers over the Meta Pixel `fbq`. No-op when the pixel isn't
 * loaded (no NEXT_PUBLIC_META_PIXEL_ID) or on the server, so callers never guard.
 */
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function pixelTrack(event: string, params?: Record<string, unknown>): void {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq("track", event, params);
  }
}

export function pixelTrackCustom(event: string, params?: Record<string, unknown>): void {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq("trackCustom", event, params);
  }
}
