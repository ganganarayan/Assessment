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
import {
  TRIGGERS,
  OFFERED_STEP_KINDS,
  offerableTriggers,
  triggerAudience,
  triggerIsLive,
} from "../src/features/workflows/types";
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

/* ------------------------------------------------- the graph, phase 1 --- */

// The three node kinds that exist in the schema so the canvas can grow into them
// without a migration against live rows. The whole value of that decision is that
// they stay OUT of the builder until the canvas can draw them - a half-offered BRANCH
// is a workflow somebody can save and the runner cannot walk.
const builderSrc = readFileSync(
  join(process.cwd(), "src", "features", "workflows", "components", "workflow-builder.tsx"),
  "utf8",
);
for (const kind of ["BRANCH", "LOOP"]) {
  expect(
    `the builder does not offer ${kind} yet`,
    !new RegExp(`kind:\\s*"${kind}"`).test(builderSrc),
    `${kind} is schema-only: BRANCH and LOOP until the canvas can draw them, A step saved with one is a workflow the runner has no rule for.`,
  );
}

const graphSchemaSrc = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
expect(
  "a run carries exactly one subject, and the database says so",
  /workflow_run_one_subject/.test(
    readFileSync(
      join(process.cwd(), "prisma", "migrations", "20261027230100_workflow_graph", "migration.sql"),
      "utf8",
    ),
  ),
  "a run with neither subject sits in the queue forever with nobody to send to; one with both sends the same sequence to two different people",
);
expect(
  "the one-run-per-person-ever unique is gone",
  !/@@unique\(\[workflowId, contactId\]\)/.test(graphSchemaSrc),
  "it meant a lead who came back next quarter silently got no follow-up, and the only evidence was an enrolment that never happened",
);

const enqueueSrc = readFileSync(join(process.cwd(), "src", "lib", "workflows", "enqueue.ts"), "utf8");
expect(
  "the enroller refuses only while a run is still live",
  /status:\s*\{\s*in:\s*\["PENDING",\s*"SENDING"\]\s*\}/.test(enqueueSrc),
  "with the unique key gone this query IS the dedup. Without it every trigger starts another copy of the same sequence.",
);
expect(
  "the runner resolves its subject once rather than per step",
  /const who = await resolveRecipient\(run\)/.test(runSrc),
  "the suppression check, the stale check, the tag step and the send each need the subject; branching at all four is three places handled and one forgotten",
);
expect(
  "a run with nobody left to reach stops instead of retrying",
  /Nobody left to send this to/.test(runSrc),
  "a deleted contact or a workspace with no login does not improve by trying again in a minute",
);

/* --------------------------------------------- the trigger vocabulary --- */

// 🔴 THE REGISTRY AND THE ENUM MUST BE THE SAME SET. A trigger the schema has and the
// registry forgot is one nobody can choose; one the registry offers and the schema
// lacks throws at the database on create. Neither shows up in a typecheck, because the
// registry is data rather than types.
const trigEnumBlock = /enum WorkflowTrigger \{([\s\S]*?)\n\}/.exec(graphSchemaSrc)?.[1] ?? "";
const trigSchemaTriggers = new Set(
  trigEnumBlock
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[A-Z][A-Z0-9_]*$/.test(l)),
);
const trigRegistryTriggers = new Set(TRIGGERS.map((t) => t.value as string));
for (const v of trigSchemaTriggers) {
  expect(`the builder knows about ${v}`, trigRegistryTriggers.has(v), "a trigger the schema has and the registry does not is one nobody can choose");
}
for (const v of trigRegistryTriggers) {
  expect(`the schema knows about ${v}`, trigSchemaTriggers.has(v), "a trigger the registry offers and the schema lacks throws at the database on create");
}

for (const t of TRIGGERS) {
  if (triggerAudience(t) !== "TENANT") continue;
  expect(
    `${t.value} is named for the audience it belongs to`,
    t.value.startsWith("TENANT_"),
    "the prefix is what makes the lead/workspace split auditable by reading the enum alone; an unprefixed tenant trigger is one somebody will later assume is about a lead",
  );
}

expect(
  "a workspace is never offered a trigger about a workspace",
  offerableTriggers(false).every((t) => triggerAudience(t) === "LEAD"),
  "offered one, a tenant would build a sequence that can never fire for them and nothing anywhere would say why",
);
expect(
  "nothing not yet emitted is offered to anybody",
  offerableTriggers(true).every(triggerIsLive),
  "a trigger you can select, publish and then watch do nothing is worse than one you never saw",
);
expect(
  "the platform can still build sequences about workspaces",
  offerableTriggers(true).some((t) => triggerAudience(t) === "TENANT"),
  "the whole point of the split is that the owner CAN nurture their own customers",
);

for (const k of OFFERED_STEP_KINDS) {
  expect(
    `the runner knows what to do with a ${k} step`,
    k === "MESSAGE" || new RegExp(`step\.kind === "${k}"`).test(runSrc),
    "a kind the builder offers and the runner does not handle is a step that silently does nothing in a live sequence",
  );
}

/* ------------------------------------- what each new step actually does --- */

// Source-level assertions, in the house style of the checks above: these are
// behaviours no type can express and no unit test can reach without a database, and
// every one of them failed silently rather than loudly when it was wrong.

const actionsSrc = readFileSync(join(process.cwd(), "src", "features", "workflows", "actions.ts"), "utf8");
const builderSrc2 = readFileSync(
  join(process.cwd(), "src", "features", "workflows", "components", "workflow-builder.tsx"),
  "utf8",
);
const wfTypesSrc = readFileSync(join(process.cwd(), "src", "features", "workflows", "types.ts"), "utf8");
const logsSrc = readFileSync(join(process.cwd(), "src", "features", "workflows", "logs-data.ts"), "utf8");
const edgesSrc = readFileSync(join(process.cwd(), "src", "lib", "workflows", "edges.ts"), "utf8");

expect(
  "the zod step kind is derived from the registry, never listed again",
  /kind:\s*z\.enum\(OFFERED_STEP_KINDS\)/.test(wfTypesSrc),
  "it was hand-listed as three while the builder offered eight, so every new kind saved in the browser and was refused by the server with an error nobody could act on",
);
expect(
  "inserting a step opens the gap before filling it",
  /displayOrder: \{ gte: at \}[\s\S]{0,120}increment: 1[\s\S]{0,400}const order = at;/.test(actionsSrc),
  "writing at an occupied displayOrder and tidying up after leaves two steps sharing a position, and that position is what the runner's cursor holds",
);
expect(
  "every step mutation rewrites the edges",
  (actionsSrc.match(/await syncEdges\(workflowId\)/g) ?? []).length >= 3,
  "add, move and delete all change the order; an edge table maintained by two of the three is worse than none, because the day the runner reads it the order is wrong and nothing says why",
);
expect(
  "the edge rewrite is wholesale, not diffed",
  /deleteMany\(\{ where: \{ workflowId \} \}\)/.test(edgesSrc),
  "diffing a reorder by hand is how an edge ends up pointing at a step in another workflow",
);

expect(
  "a Meta event is never sent without something to match on",
  /if \(!who\.email && !who\.mobile\)[\s\S]{0,200}No email or mobile to match on/.test(runSrc),
  "Meta accepts an event with no user data and attributes it to nobody, which inflates the count and teaches the ad account nothing",
);
expect(
  "a preview run never reaches Meta",
  /isPreview: true[\s\S]{0,300}Preview run - not sent to Meta/.test(runSrc),
  "everything else about a preview is real on purpose, so a preview booking enrols a contact and walks the same sequence; without the guard the owner testing their own funnel fires a live conversion and Meta learns to find more people like them",
);
expect(
  "each Meta event carries its own id",
  /eventId: randomUUID\(\)/.test(runSrc),
  "a shared id makes Meta count the whole sequence once; there is no browser event to deduplicate against, because the browser was never there",
);
expect(
  "a workflow conversion is logged beside every other one",
  /sendAndLogLifecycleCapi/.test(runSrc),
  "a second sender would mean a conversion that does not appear in the CAPI log, which is the one place anybody looks when Meta shows nothing",
);
expect(
  "the event is picked from a list, not typed",
  /options\.capiEvents\.map/.test(builderSrc2),
  "a typo in an event name does not fail: it sends a real conversion under a name nothing else uses, and Events Manager then shows a number no funnel will ever add to again",
);

expect(
  "the Zoom link is written to the run, not the step",
  /prisma\.workflowRun[\s\S]{0,160}meetingLink: made\.joinUrl/.test(runSrc),
  "a step is shared by everybody who passes through the sequence; storing the meeting on it hands the second person the first person's call",
);
expect(
  "the Zoom step is hidden where Zoom is not connected",
  /needsZoom: true/.test(wfTypesSrc) && /offerableSteps\(/.test(builderSrc2),
  "a step that cannot work is worse than one that is missing: it saves, publishes, and then fails for every person who reaches it with nothing on screen to say why",
);

expect(
  "the log reads the step kind from the step",
  /s\.step\?\.kind/.test(logsSrc),
  "WorkflowSend.channel is required, so a tag change and a webhook call both record themselves as EMAIL - harmless in the database and a lie on a screen",
);
expect(
  "a stopped run says why on the closed row",
  /r\.stopReason \?/.test(
    readFileSync(
      join(process.cwd(), "src", "features", "workflows", "components", "workflow-logs.tsx"),
      "utf8",
    ),
  ),
  "\"Stopped\" alone is the thing somebody came to the log to ask about; making them click to find out why is the difference between a log and a log nobody opens",
);

expect(
  "placeholder chips have fields to type into",
  (builderSrc2.match(/data-ph="1"/g) ?? []).length >= 3,
  "the chips insert into the last focused field that opted in; with none opted in they are decoration",
);

console.log(failures === 0 ? "\nAll workflow queue checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
