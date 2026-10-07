// Deliberately NOT `server-only`: mirrors abandoned.ts, which the Railway cron reaches
// from outside Next where that package does not resolve.
import { sweepGateAbandoned, ABANDON_GRACE_MINUTES } from "@/lib/events/abandoned";

/**
 * Take the abandon verdict when its grace period is up, with no scheduler.
 *
 * The verdict is due ten minutes after someone leaves the opt-in form, and something has
 * to be awake then. The obvious answer is a cron, and the obvious answer is wrong here:
 * a separate scheduled service is one more thing to create, hold credentials, keep
 * running and remember - and a funnel that quietly stops building its retargeting
 * audience because a cron was paused looks exactly like a funnel where nobody abandons.
 *
 * Two mechanisms instead, both inside the app that is already running:
 *
 *   1. A TIMER, armed when the beacon arrives. The app is a long-lived Node process on
 *      Railway, not a serverless function, so a setTimeout survives until it fires. One
 *      timer serves every pending row, because the sweep processes all of them: a
 *      thousand departures still arm one timer.
 *
 *   2. A NUDGE on ordinary traffic, throttled. A deploy or a restart kills pending
 *      timers, so the next visitor to the funnel clears anything left behind. The rows
 *      carry their own due time, so nothing is lost by a timer that never fired - it is
 *      only taken later.
 *
 * Together they cover everything except a restart during a period with no traffic at
 * all, and that case resolves itself the moment anyone arrives.
 *
 * Both are fire-and-forget and both swallow their errors. A failed sweep must never
 * surface to a respondent or fail the request it rode in on.
 */

/** At most one timer: the sweep is not per-row, so a second would do the same work. */
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

/** When the nudge last ran, so ordinary traffic cannot sweep on every page view. */
let lastNudge = 0;
const NUDGE_INTERVAL_MS = 60_000;

/** A little past the grace period, so a row due at the same instant is already due. */
const TIMER_MS = ABANDON_GRACE_MINUTES * 60 * 1000 + 20_000;

function runSweep(): void {
  lastNudge = Date.now();
  void sweepGateAbandoned().catch(() => {
    /* analytics must never break the request it rode in on */
  });
}

/**
 * Someone just left the opt-in form: make sure the verdict gets taken when it is due.
 * Does nothing if a timer is already pending, because that timer will sweep this row too.
 */
export function scheduleAbandonSweep(): void {
  if (pendingTimer) return;
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    runSweep();
  }, TIMER_MS);
  // Never hold the process open on account of analytics.
  pendingTimer.unref?.();
}

/**
 * Ordinary traffic: clear anything already due. Throttled to once a minute, so a busy
 * funnel costs one query a minute rather than one per visit.
 *
 * This is what makes the timer safe to lose. A deploy drops every pending timer, and the
 * next person who opens the funnel picks up whatever those timers were going to do.
 */
export function nudgeAbandonSweep(): void {
  if (Date.now() - lastNudge < NUDGE_INTERVAL_MS) return;
  runSweep();
}
