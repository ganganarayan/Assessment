/**
 * Fire a browser event on the Assess360 SaaS pixel. Uses `trackSingle` so the event
 * lands on THIS pixel only, and passes the server-generated eventID so it dedups with
 * the matching CAPI event. No-op when the pixel isn't configured/loaded.
 */
type Fbq = (method: string, ...args: unknown[]) => void;

export function firePlatformBrowserEvent(
  pixelId: string | null,
  eventName: string,
  data: Record<string, unknown> = {},
  eventId?: string,
): void {
  if (!pixelId || typeof window === "undefined") return;
  const fbq = (window as unknown as { fbq?: Fbq }).fbq;
  if (typeof fbq !== "function") return;
  try {
    fbq("trackSingle", pixelId, eventName, data, eventId ? { eventID: eventId } : undefined);
  } catch {
    /* pixel not ready — non-fatal */
  }
}
