/**
 * Workflow queue safety (no DB). The two faults the release gate made reachable are
 * fixed in the engine (69fea1f); this is the regression harness for them, and for the
 * relationships BETWEEN the windows, which is where this gets quietly broken later.
 *
 * What it holds in place:
 *   1. A step too late to send is skipped, not sent. Boundaries checked from both
 *      sides, because an off-by-one here means either a month-old message lands or an
 *      ordinary overnight outage silently drops everybody's sequence.
 *   2. An unfired run is judged on DUE TIME, never age. A fourteen-day delay creates a
 *      row today that is correctly due in two weeks; pruning by age cancels a message
 *      somebody is waiting for.
 *   3. Every WorkflowRunStatus is reached by one of the sweep rules. A status in
 *      neither is exactly how fault 2 happened: rows that can never terminate, and a
 *      sweep that only ever looked at terminal ones.
 *   4. The windows are ORDERED. Skip-as-stale must come long before declare-dead, and
 *      declare-dead before delete, or a run gets cancelled while its step was still
 *      worth sending, or deleted before the owner can see why it stopped.
 *   5. The sequence engine tolerates more lateness than the appointment reminder does -
 *      the two windows are deliberately separate constants, and this is the invariant
 *      that catches somebody "tidying up" by pointing one at the other.
 *
 *   npx tsx --conditions=react-server scripts/verify-workflow-queue.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isStale, STALE_AFTER_MS } from "../src/lib/workflows/schedule";
import { STALE_AFTER_MS as REMINDER_STALE_AFTER_MS } from "../src/lib/automation/schedule";
import { DEAD_AFTER_MS, SEND_KEEP_MS, TERMINAL_KEEP_MS } from "../src/lib/workflows/retention";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

console.log("Workflow queue verification\n");

const NOW = new Date(1_800_000_000_000);
const at = (ms: number) => new Date(NOW.getTime() + ms);
const MIN = 60_000;
const DAY = 86_400_000;

// --- 1. Too late is not not-yet ----------------------------------------------------
expect("a step due now is sent", !isStale(NOW, NOW));
expect("a step due in the future is never stale", !isStale(at(DAY), NOW));
expect(
  "an overnight outage still delivers",
  !isStale(at(-12 * 3_600_000), NOW),
  "a cron that stopped for the night must not drop everybody's sequence",
);
expect("a step just inside the window is sent", !isStale(at(-STALE_AFTER_MS + MIN), NOW));
expect(
  "a step just past the window is not",
  isStale(at(-STALE_AFTER_MS - MIN), NOW),
  "a feature switched off and back on must not deliver a step whose moment has gone",
);
expect("a month-old step is never sent", isStale(at(-30 * DAY), NOW));

// --- 5. The two engines keep their own windows, in the right relation --------------
expect(
  "a sequence step tolerates more lateness than an appointment reminder",
  STALE_AFTER_MS > REMINDER_STALE_AFTER_MS,
  "a reminder announcing a call that already happened is harmful; a nurture message a day late is merely late. If these are now equal, somebody has pointed one engine at the other's constant.",
);

// --- 4. The windows are ordered ----------------------------------------------------
expect(
  "a step is skipped long before its run is declared dead",
  STALE_AFTER_MS < DEAD_AFTER_MS,
  "otherwise a run is cancelled while its next step was still worth sending",
);
expect(
  "a dead run is kept long enough to be read",
  DEAD_AFTER_MS < TERMINAL_KEEP_MS,
  "it is cancelled with a reason so the owner can answer why these people stopped halfway - deleting it first takes that away",
);
expect("the per-send log is kept for a positive window", SEND_KEEP_MS > 0);

// --- 2 and 3. The sweep rules ------------------------------------------------------
const ret = readFileSync(join(process.cwd(), "src", "lib", "workflows", "retention.ts"), "utf8");

expect(
  "unfired runs are judged on due time",
  /status: \{ in: \["PENDING", "SENDING"\] \}[\s\S]{0,200}dueAt: \{ lt:/.test(ret),
  "the PENDING/SENDING rule must key on dueAt. Keyed on createdAt it cancels sequences that are simply not due yet.",
);
expect(
  "no sweep rule judges an unfired run by age",
  !/status: \{ in: \["PENDING", "SENDING"\] \}[\s\S]{0,200}createdAt: \{ lt:/.test(ret),
);
expect(
  "terminal runs are collected",
  /status: \{ in: \["DONE", "FAILED", "CANCELLED"\] \}/.test(ret),
);

// Every status the schema can produce must be reachable by one of the rules above.
// Listed literally rather than imported from Prisma: importing the enum would make this
// agree with whatever the schema says, including a new status nobody has written a rule
// for, which is the hole being closed.
for (const status of ["PENDING", "SENDING", "DONE", "FAILED", "CANCELLED"]) {
  expect(
    `${status} is reached by a sweep rule`,
    ret.includes(`"${status}"`),
    "a status in neither rule can never be deleted, whatever its age or due time",
  );
}

// --- The wiring --------------------------------------------------------------------
const runSrc = readFileSync(join(process.cwd(), "src", "lib", "workflows", "run.ts"), "utf8");
expect(
  "the drain consults the window before sending",
  /isStale\(run\.dueAt/.test(runSrc),
);
expect(
  "a stale step is recorded, not silently dropped",
  /isStale\(run\.dueAt[\s\S]{0,600}(logSend|SKIPPED)/.test(runSrc),
  "the owner has to be able to see that it was skipped and why",
);
expect(
  "a stale step does not end the run",
  /isStale\(run\.dueAt[\s\S]{0,900}currentStep/.test(runSrc),
  "lateness is the product's fault, not a signal about the person - the sequence continues",
);

const cronSrc = readFileSync(join(process.cwd(), "scripts", "run-workflows.ts"), "utf8");
expect(
  "something actually calls the sweep",
  cronSrc.includes("sweepWorkflowRetention"),
  "a sweep nothing invokes is the leak it was written to fix",
);

/**
 * Every trigger the database knows is one the builder offers, and vice versa.
 *
 * 🔴 A trigger in the enum but not in TRIGGERS is a trigger that can fire and start
 * sequences nobody can see or edit. One in TRIGGERS but not the enum is a choice the
 * menu shows and the save rejects. Both are silent, and both are a one-line omission
 * when the next trigger gets added, so the two lists are compared here rather than
 * trusted to stay in step.
 */
const schemaSrc = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
const enumBlock = /enum WorkflowTrigger \{([\s\S]*?)\n\}/.exec(schemaSrc)?.[1] ?? "";
const enumValues = enumBlock
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, "").trim())
  .filter((l) => /^[A-Z][A-Z_]*$/.test(l));
const typesSrc = readFileSync(join(process.cwd(), "src", "features", "workflows", "types.ts"), "utf8");
const registryBlock = /export const TRIGGERS: TriggerSpec\[\] = \[([\s\S]*?)\n\];/.exec(typesSrc)?.[1] ?? "";
const registryValues = [...registryBlock.matchAll(/value:\s*"([A-Z_]+)"/g)]
  .map((m) => m[1])
  .filter((v): v is string => !!v);

expect("the schema's trigger list was found", enumValues.length > 0);
expect("the builder's trigger registry was found", registryValues.length > 0);
for (const v of enumValues) {
  expect(
    `${v} is offered in the builder`,
    registryValues.includes(v),
    "a trigger that can fire but cannot be chosen starts sequences nobody can see",
  );
}
for (const v of registryValues) {
  expect(
    `${v} is a trigger the database accepts`,
    enumValues.includes(v),
    "the menu would offer it and the save would refuse it",
  );
}
expect(
  "the appointment triggers are among them",
  ["APPOINTMENT_BOOKED", "APPOINTMENT_CANCELLED", "APPOINTMENT_TIME_PASSED"].every((v) =>
    enumValues.includes(v),
  ),
);
const schedulerSrc = readFileSync(join(process.cwd(), "src", "lib", "automation", "scheduler.ts"), "utf8");

expect(
  "the trigger nothing emits has a sweep behind it",
  schedulerSrc.includes("sweepTimePassedAppointments"),
  "APPOINTMENT_TIME_PASSED is found, not emitted - with no sweep on the heartbeat it never fires at all",
);

/**
 * 🔴 SOMETHING HAS TO DRAIN THE QUEUE. This is the fault that shipped, and it is worth
 * reading in full because it is indistinguishable from a broken feature.
 *
 * Sequences were enrolled correctly on every trigger and then sat there. The only caller
 * of runDueWorkflows was /api/cron/workflows, which fails closed without CRON_SECRET, so
 * no step after the first ever came due. Nothing was lost - a run is a row holding a
 * cursor - but every workflow in the product silently stopped after its first message,
 * which reads exactly like a workflow engine that does not work.
 *
 * The fix was to put the drain on the heartbeat the app already has. Four separate
 * things have to stay true for that to keep working, and each one is a plausible tidy-up.
 */
expect(
  "the workflow queue has a drain",
  /runDueWorkflows\(/.test(schedulerSrc),
  "with no caller on the heartbeat, the only runner left is an HTTP route that fails closed without CRON_SECRET - and the product cannot depend on somebody having created a cron",
);
expect(
  "the drain is actually on the beat",
  /async function tick\(\)[\s\S]*?drainWorkflows\(/.test(schedulerSrc),
  "a drain function nothing calls is the same outage with more code in it",
);
expect(
  "the workflow drain cannot cost the other engine its beat",
  /try \{\s*await drainWorkflows\(\);/.test(schedulerSrc),
  "both queues ride one timer. An unguarded throw in either stops reminders and sequences together, and the next tick is only scheduled at the end of this one.",
);
expect(
  "the drain stops on a pass that claimed nothing, not on a short batch",
  /drainWorkflows[\s\S]{0,400}summary\.claimed === 0/.test(schedulerSrc),
  "a run can be passed over WITHOUT being claimed - the release switch skips it and leaves it PENDING on purpose - so a short batch would read as an empty queue while work remained",
);

const bootSrc = readFileSync(join(process.cwd(), "src", "instrumentation.ts"), "utf8");
expect(
  "the heartbeat is started on boot",
  /startAutomationScheduler\(\)/.test(bootSrc),
  "nothing else starts it. Without this line every queue in the product is full and still, and no error is reported anywhere.",
);
expect(
  "the heartbeat is started once per process, not per request",
  /NEXT_RUNTIME === "nodejs"/.test(bootSrc),
  "instrumentation runs once on server start; a timer armed from a request path is a timer per request",
);

console.log(failures === 0 ? "\nAll workflow queue checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
