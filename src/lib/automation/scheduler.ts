import "server-only";
import { runDueAutomations } from "@/lib/automation/run";
import { pruneAutomationHistory } from "@/lib/automation/retention";
import { syncDueAppointments } from "@/lib/google/calendar";
import { sweepTimePassedAppointments } from "@/lib/calendar/time-passed";

/**
 * The clock, inside the app.
 *
 * 🔴 NO EXTERNAL SCHEDULER, by requirement. Reminders cannot depend on a Railway cron,
 * a Vercel cron or anything else outside this process, because the product runs for
 * thousands of tenants and "somebody remembered to add the cron job" is not a guarantee
 * anybody can make. The server is already a long-lived Node process; this gives it a
 * heartbeat and the database does the rest.
 *
 * WHY THIS IS SAFE WITH SEVERAL REPLICAS. The timer does not decide anything. Every run
 * is claimed with a conditional UPDATE (status PENDING -> SENDING, matched on the old
 * status), so of ten instances ticking at once, exactly one wins each row and the other
 * nine get a count of zero and move on. Adding instances adds throughput, never
 * duplicates. The tick is jittered for the same reason, so they do not all wake on the
 * same second and queue behind one another on the same index.
 *
 * WHY IT SCALES PAST A THOUSAND TENANTS. The work is found with ONE indexed query
 * (status, dueAt) across every tenant, not a loop over tenants, so the cost of a tick is
 * the number of messages DUE and has nothing to do with how many workspaces exist. A
 * quiet minute is one index probe that returns nothing.
 *
 * WHAT A RESTART COSTS. Nothing is in memory: a reminder is a row with a due time. A
 * deploy, a crash or a scale-to-zero means the next process to boot picks up everything
 * that came due while nobody was listening, which is why the first tick is seconds after
 * boot rather than a full interval later.
 *
 * 🟡 The one failure mode left is a host that stops running the process entirely (an
 * idle-sleep setting that parks it). Nothing is lost there either - the rows wait - but
 * sends are late until something wakes it, so the HTTP trigger at
 * /api/cron/automations stays available as an optional kick from outside.
 */

/** How often the heartbeat beats when there is nothing to do. */
const TICK_MS = 30_000;
/** Spread across replicas, so ten instances do not hit the same index on the same tick. */
const JITTER_MS = 7_000;
/** Rows claimed per pass. Small enough that one slow SMTP server cannot stall a batch
 *  for long, large enough that a busy minute is a handful of passes. */
const BATCH = 25;
/** A burst is drained over several passes; past this the rest waits for the next tick,
 *  so one enormous backlog cannot monopolise the process. */
const MAX_PASSES = 20;
/** The retention sweep is hourly: it deletes by date, and nothing gets meaningfully
 *  staler in between. */
const PRUNE_EVERY_MS = 60 * 60_000;
/** The first tick after boot: soon, because anything overdue has been waiting. */
const BOOT_DELAY_MS = 5_000;

let started = false;
let lastPruneAt = 0;

async function drain(): Promise<void> {
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const summary = await runDueAutomations(BATCH);
    // A pass that did not fill its batch has emptied the queue.
    if (summary.claimed < BATCH) return;
  }
}

async function tick(): Promise<void> {
  try {
    await drain();
  } catch (e) {
    console.error("[automation-scheduler] drain failed:", e instanceof Error ? e.message : String(e));
  }

  /**
   * Push bookings to the Google calendars that are connected.
   *
   * It rides on this heartbeat rather than calling Google at each write site, so one
   * code path covers a booking, an owner's edit, a respondent's reschedule and a
   * cancellation - and so a failed or interrupted write is simply still stale on the
   * next tick. Nothing to queue, nothing to retry by hand. A workspace with no Google
   * connection costs one indexed query that returns nothing.
   */
  try {
    await syncDueAppointments();
  } catch (e) {
    console.error("[automation-scheduler] google sync failed:", e instanceof Error ? e.message : String(e));
  }

  /**
   * The one trigger nothing emits: a call whose hour passed with nobody marking it.
   *
   * It belongs on the heartbeat rather than at a write site because there IS no write
   * site - the whole point is that nobody did anything. One indexed query that returns
   * nothing on a quiet tick, same as the drain above it.
   */
  try {
    const fired = await sweepTimePassedAppointments();
    if (fired) console.log(`[automation-scheduler] ${fired} unmarked call(s) started a sequence`);
  } catch (e) {
    console.error(
      "[automation-scheduler] time-passed sweep failed:",
      e instanceof Error ? e.message : String(e),
    );
  }

  try {
    const now = Date.now();
    if (now - lastPruneAt >= PRUNE_EVERY_MS) {
      lastPruneAt = now;
      const pruned = await pruneAutomationHistory(now);
      if (pruned.runs || pruned.sends) {
        console.log(`[automation-scheduler] pruned ${pruned.runs} run(s), ${pruned.sends} send(s)`);
      }
    }
  } catch (e) {
    console.error("[automation-scheduler] prune failed:", e instanceof Error ? e.message : String(e));
  }

  schedule(TICK_MS + Math.floor(Math.random() * JITTER_MS));
}

function schedule(ms: number): void {
  // Chained timeouts rather than setInterval: a tick that takes longer than the interval
  // must not have the next one stacked on top of it.
  const timer = setTimeout(() => void tick(), ms);
  // Never hold the process open on its own account. A script that imports this module
  // for one function should still be able to exit.
  timer.unref?.();
}

/**
 * Start the heartbeat. Idempotent, and called once per server process from
 * instrumentation.ts - never from a request path, where it would start a timer per
 * request.
 */
export function startAutomationScheduler(): void {
  if (started) return;
  started = true;
  // Stagger the very first beat too: a deploy restarts every replica at once, and they
  // would otherwise all reach for the same rows in the same second.
  schedule(BOOT_DELAY_MS + Math.floor(Math.random() * JITTER_MS));
  console.log("[automation-scheduler] started");
}
