/**
 * Auth route constants shared by the EDGE middleware and server guards.
 *
 * Deliberately dependency-free (no "server-only", no prisma) so middleware can import
 * it without pulling the server bundle in.
 *
 * 🔴 Why the "expired" marker exists. Middleware decides from cookie PRESENCE — it
 * cannot validate a session at the edge without a database. The page then validates
 * for real. When a cookie exists but its session does not, the two disagree forever:
 *
 *     /dashboard  (cookie present → allowed through, page finds no session) → /sign-in
 *     /sign-in    (cookie present → "you're signed in") → /dashboard  ↻
 *
 * The browser gives up and renders a blank page. Nothing on screen says "session
 * expired", so it reads as the app being broken.
 *
 * It is not an edge case: every revoked session leaves exactly this state — an admin
 * setting a password, a self-service change, a soft-deleted user, a session expiring
 * overnight. The marker lets the guard tell middleware "I already checked, this cookie
 * is dead", which breaks the cycle deterministically rather than hoping one side wins.
 */

export const SIGN_IN_PATH = "/sign-in";

/** Query flag meaning "a real session check already failed — do not bounce me back". */
export const SESSION_EXPIRED_PARAM = "expired";

/** Where a server guard sends someone whose cookie outlived its session. */
export const SIGN_IN_EXPIRED = `${SIGN_IN_PATH}?${SESSION_EXPIRED_PARAM}=1`;
