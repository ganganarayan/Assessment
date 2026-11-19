import "server-only";

/**
 * Space participant emails 10 to 20 seconds apart, per sending account.
 *
 * Owner decision, 19-11-2026: in a live room 60 people finish within a minute, and 60
 * result emails leaving one account in the same second reads like a blast to the mail
 * provider. Each send reserves the next free slot on its account, then waits for it,
 * so the first goes out at once and every following one 10 to 20 seconds (random)
 * after the one before.
 *
 * The reservation is synchronous, so two callers can never take the same slot.
 *
 * 🟡 Held in this process's memory. A restart drops the waiting sends; the caller
 * claims its once-guard only AFTER the wait, so a dropped send stays visibly unsent
 * and can be resent by hand, rather than marked sent and lost.
 */
const MIN_GAP_MS = 10_000;
const MAX_GAP_MS = 20_000;

const nextFree = new Map<string, number>();

/** The account key: a workspace sends on its own email settings, null on the platform's. */
export function emailAccountKey(tenantId: string | null): string {
  return tenantId ?? "platform";
}

/** Pure: when the call after a slot at `slot` may start, given a random draw in [0, 1). */
export function nextSlotAfter(slot: number, draw: number): number {
  return slot + MIN_GAP_MS + Math.floor(draw * (MAX_GAP_MS - MIN_GAP_MS + 1));
}

/** Resolves when this caller may send. */
export async function waitForEmailSlot(accountKey: string): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextFree.get(accountKey) ?? 0);
  nextFree.set(accountKey, nextSlotAfter(slot, Math.random()));
  const wait = slot - now;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}
