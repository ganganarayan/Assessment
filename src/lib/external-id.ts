/**
 * First-party visitor id for Meta matching. A UUID minted on first visit and kept
 * in localStorage, sent to the server (→ CAPI external_id) and set on the browser
 * pixel's advanced matching. The SAME key/value is used by both the pixel base code
 * (components/meta-pixel.tsx, inlined) and the runner, so the two events match on it.
 */
export const EXTERNAL_ID_KEY = "a360_xid";

/** Read the stored id, minting + persisting one if absent. Null when storage is
 *  blocked (private mode) — the caller simply omits external_id. Client-only. */
export function getOrCreateExternalId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let v = localStorage.getItem(EXTERNAL_ID_KEY);
    if (!v) {
      v =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(EXTERNAL_ID_KEY, v);
    }
    return v;
  } catch {
    return null;
  }
}
