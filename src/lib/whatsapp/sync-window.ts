/**
 * The 24 hours in which a freshly connected coexistence number will hand over its
 * contacts and its past chats.
 *
 * A PLAIN module, no DB and no server-only, so the card can show the same deadline the
 * action enforces. One definition, so the screen cannot promise an hour the server has
 * already written off.
 *
 * 🔴 The window is Meta's, not ours, and Meta is the one that enforces it. This is used
 * to WARN, never to refuse: our clock could be wrong, Meta's grace could be longer than
 * documented, and refusing locally would deny somebody their one attempt on the
 * strength of a guess about the time. So a closed window greys nothing out; it says
 * what is likely and lets the owner try anyway.
 */

/** Meta documents "24 hours after onboarding" for both syncs. */
export const SYNC_WINDOW_MS = 24 * 60 * 60 * 1000;

/** When the chance to sync runs out, or null when nothing was onboarded. */
export function syncWindowClosesAt(onboardedAt: Date | null | undefined): Date | null {
  if (!onboardedAt) return null;
  return new Date(onboardedAt.getTime() + SYNC_WINDOW_MS);
}

/**
 * Is there still time?
 *
 * No onboarding stamp means no window at all, which is a false rather than a true: a
 * number typed in by hand was never onboarded and can never sync.
 */
export function syncWindowOpen(onboardedAt: Date | null | undefined, now: Date = new Date()): boolean {
  const closes = syncWindowClosesAt(onboardedAt);
  if (!closes) return false;
  return now.getTime() < closes.getTime();
}

/** "about 7 hours left", for a card that should not make somebody do arithmetic. */
export function describeTimeLeft(onboardedAt: Date | null | undefined, now: Date = new Date()): string | null {
  const closes = syncWindowClosesAt(onboardedAt);
  if (!closes) return null;
  const ms = closes.getTime() - now.getTime();
  if (ms <= 0) return "the 24 hours are up";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `about ${hours} hour${hours === 1 ? "" : "s"} left`;
  const mins = Math.max(1, Math.round(ms / 60_000));
  return `about ${mins} minute${mins === 1 ? "" : "s"} left`;
}
