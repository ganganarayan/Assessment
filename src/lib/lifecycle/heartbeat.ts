import "server-only";
import { planToday, istDayKey, istHour } from "@/lib/lifecycle/plan";

/**
 * The planner's own clock, deliberately not the app's main one.
 *
 * 🔴 WHY THIS IS A SECOND WORKER AND NOT ANOTHER BLOCK IN THE AUTOMATION TICK.
 * That tick is a chain: it awaits each job in turn and only schedules the next beat
 * once the last one returns. Everything on it is a cheap indexed sweep that finishes
 * in milliseconds, which is what makes a 30 second heartbeat honest.
 *
 * Planning is not that. It walks every trialling workspace in sequence, and each one
 * can spend up to the AI call's 60 second timeout. Twenty trials is twenty minutes in
 * the worst case, and on the shared tick those twenty minutes would be twenty minutes
 * with no reminders going out, no Google sync, no unmarked-call sweep and no lifecycle
 * sends, because all of them are waiting their turn behind it.
 *
 * So the split is by SPEED, not by feature. Everything that is a quick queue sweep
 * stays on the fast heartbeat, including the lifecycle SENDER, which is a single
 * indexed query and belongs there. The one job that calls a model gets its own timer
 * and is free to take as long as it takes.
 *
 * WHY A CHECK EVERY FEW MINUTES RATHER THAN A TIMER SET FOR 06:00. Same reason as
 * everywhere else in this product: a timer set for a moment hours away is memory, and
 * memory does not survive the deploy that happens in between. Asking "has 06:00 IST
 * passed and have I planned today" costs two pure functions and no database work at
 * all on the 287 checks a day where the answer is no.
 *
 * WHY THE DAY MARKER IS IN MEMORY. The real idempotency is per person: each profile is
 * claimed with a conditional UPDATE on lastPlannedOn before any work is done, so a
 * restart at noon costs one query per already-planned person and correctly plans
 * anybody who enrolled since. A marker in the database would be a row to lose and
 * would buy nothing. Several replicas each run this and the claim sorts them out.
 */

/** The hour, in IST, from which the day's messages may be written. */
const PLAN_HOUR_IST = 6;
/** How often to ask whether that hour has passed. Costs nothing when the answer is no. */
const CHECK_MS = 5 * 60_000;
/** Spread across replicas, so they do not all reach for the same profiles at once. */
const JITTER_MS = 60_000;
/** After boot, late enough that the fast heartbeat has already taken its first beat. */
const BOOT_DELAY_MS = 20_000;

let started = false;
let plannedOn = "";

async function tick(): Promise<void> {
  try {
    const today = istDayKey();
    if (plannedOn !== today && istHour() >= PLAN_HOUR_IST) {
      // Marked before the await, not after: a run that throws must not be retried on
      // the next check five minutes later, and the per-person claims already record
      // exactly who was dealt with.
      plannedOn = today;
      const at = Date.now();
      const s = await planToday();
      if (!s.heldBack) {
        console.log(
          `[lifecycle-planner] ${today}: planned ${s.planned}, escalated ${s.escalated}, skipped ${s.skipped}, by model ${s.byModel}, failed ${s.failed}, closed ${s.closed}, took ${Math.round((Date.now() - at) / 1000)}s`,
        );
      }
    }
  } catch (e) {
    console.error(
      "[lifecycle-planner] run failed:",
      e instanceof Error ? e.message : String(e),
    );
  }

  schedule(CHECK_MS + Math.floor(Math.random() * JITTER_MS));
}

function schedule(ms: number): void {
  // Chained timeouts rather than setInterval, so a long planning run never has the
  // next check stacked on top of it.
  const timer = setTimeout(() => void tick(), ms);
  // Never hold the process open on its own account.
  timer.unref?.();
}

/**
 * Start the planner's clock. Idempotent, and called once per server process from
 * instrumentation.ts.
 */
export function startLifecyclePlanner(): void {
  if (started) return;
  started = true;
  schedule(BOOT_DELAY_MS + Math.floor(Math.random() * JITTER_MS));
  console.log("[lifecycle-planner] started");
}
