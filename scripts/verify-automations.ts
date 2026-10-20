/**
 * Unit checks for the automation rules that are decided by arithmetic and by schema,
 * not by looking (pure, no DB). Run with:
 *   npm run verify:automations
 *
 * What is worth pinning down here: a reminder's due time, because an offset with the
 * wrong sign sends "your call is tomorrow" an hour after the call; the validation that
 * refuses a message with nothing in it, because such a rule saves perfectly and then
 * does nothing at the moment it matters, hours later and invisibly; and the placeholder
 * substitution, because a typo'd placeholder must stay visible rather than render as an
 * empty space in somebody's inbox.
 *
 * Exits non-zero on the first failure, like the other verify-* scripts.
 */
import {
  PRUNABLE_RUN_STATUSES,
  RETENTION_DAYS,
  isStale,
  isStillAhead,
  reminderDueAt,
  respectsSuppression,
  retentionCutoff,
  STALE_AFTER_MS,
} from "../src/lib/automation/schedule";
import { automationSchema, automationActionSchema } from "../src/features/automation/schemas";
import {
  APPOINTMENT_PLACEHOLDERS,
  offsetLabel,
  TRIGGERS,
  OFFSET_PRESETS,
} from "../src/features/automation/types";
import { fillPlaceholders } from "../src/features/nurture/config";

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

/* ------------------------------------------------------------- due times --- */

console.log("Reminder due times");
const start = new Date("2026-10-22T04:30:00.000Z"); // 10:00 IST on the 22nd

check(
  "a day before is 24 hours earlier",
  reminderDueAt(start, -1440).toISOString() === "2026-10-21T04:30:00.000Z",
);
check(
  "an hour before is an hour earlier",
  reminderDueAt(start, -60).toISOString() === "2026-10-22T03:30:00.000Z",
);
check(
  "a positive offset is AFTER the call, not before",
  reminderDueAt(start, 60).getTime() > start.getTime(),
);
check("zero is the start itself", reminderDueAt(start, 0).getTime() === start.getTime());
check(
  "the offset is minutes, not hours",
  reminderDueAt(start, -90).toISOString() === "2026-10-22T03:00:00.000Z",
);

console.log("\nReminders that can never come due");
const bookedAt = Date.parse("2026-10-22T03:00:00.000Z"); // 08:30 IST, 90 minutes before
check(
  "a day-ahead reminder for a call booked this morning is NOT queued",
  !isStillAhead(reminderDueAt(start, -1440), bookedAt),
);
check(
  "the one-hour reminder for that same call still is",
  isStillAhead(reminderDueAt(start, -60), bookedAt),
);
check(
  "an after-the-call follow-up is always still ahead at booking time",
  isStillAhead(reminderDueAt(start, 60), bookedAt),
);

console.log("\nHow an offset reads");
check("a day before", offsetLabel(-1440) === "1 day before the call");
check("two days before", offsetLabel(-2880) === "2 days before the call");
check("an hour before", offsetLabel(-60) === "1 hour before the call");
check("fifteen minutes before", offsetLabel(-15) === "15 minutes before the call");
check("an hour after", offsetLabel(60) === "1 hour after the call");
check("zero says what it is", offsetLabel(0) === "as the call starts");
check(
  "every preset reads as a sentence",
  OFFSET_PRESETS.every((p) => offsetLabel(p.value).length > 0),
);

/* ----------------------------------------------------------- validation --- */

console.log("\nWhat the builder refuses");
const emailAction = { channel: "EMAIL" as const, subject: "Hi", body: "<p>Hi</p>" };
const wabaAction = { channel: "WABA" as const, wabaTemplate: "reminder", wabaLang: "en", wabaVars: ["{{firstName}}"] };

check("a complete email action is accepted", automationActionSchema.safeParse(emailAction).success);
check(
  "an email with no body is refused",
  !automationActionSchema.safeParse({ channel: "EMAIL", subject: "Hi", body: "" }).success,
);
check(
  "an email with no subject is refused",
  !automationActionSchema.safeParse({ channel: "EMAIL", subject: "", body: "x" }).success,
);
check("a WhatsApp action with a template is accepted", automationActionSchema.safeParse(wabaAction).success);
check(
  "a WhatsApp action with no template is refused",
  !automationActionSchema.safeParse({ channel: "WABA", wabaTemplate: "" }).success,
);

const base = { name: "Reminder", trigger: "APPOINTMENT_REMINDER" as const, actions: [emailAction] };
check("a reminder with an offset is accepted", automationSchema.safeParse({ ...base, offsetMin: -1440 }).success);
check(
  "a reminder due exactly at the start is refused",
  !automationSchema.safeParse({ ...base, offsetMin: 0 }).success,
);
check(
  "an offset beyond a week is refused",
  !automationSchema.safeParse({ ...base, offsetMin: -20000 }).success,
);
check(
  "a rule with no messages is refused",
  !automationSchema.safeParse({ ...base, offsetMin: -60, actions: [] }).success,
);
check(
  "an event trigger needs no offset",
  automationSchema.safeParse({ name: "Confirm", trigger: "APPOINTMENT_BOOKED", actions: [emailAction] }).success,
);
check(
  "an unknown trigger is refused",
  !automationSchema.safeParse({ name: "x", trigger: "SOMETHING_ELSE", actions: [emailAction] }).success,
);
check(
  "every trigger the UI offers is one the schema accepts",
  TRIGGERS.every(
    (t) => automationSchema.safeParse({ name: "x", trigger: t.value, offsetMin: -60, actions: [emailAction] }).success,
  ),
);

/* --------------------------------------------------------- placeholders --- */

console.log("\nPlaceholders");
const lead = { firstName: "Ganesh", lastName: "Kumar", email: "g@example.com", mobile: "+91999", profession: "Coach" };
const extra = {
  appointmentTime: "10:00",
  appointmentDate: "22-10-2026",
  bookingName: "30-minute strategy call",
  meetingLink: "https://example.com/meet",
  bookingUrl: "https://example.com/b/call?t=tok",
  icsUrl: "https://example.com/appointment.ics",
};

check(
  "lead fields still fill, as nurture relies on",
  fillPlaceholders("Hi {{firstName}}", lead, extra) === "Hi Ganesh",
);
check(
  "the appointment fields fill",
  fillPlaceholders("{{bookingName}} on {{appointmentDate}} at {{appointmentTime}}", lead, extra) ===
    "30-minute strategy call on 22-10-2026 at 10:00",
);
check(
  "the date is Indian order, never the runtime's",
  fillPlaceholders("{{appointmentDate}}", lead, extra) === "22-10-2026",
);
check(
  "their own booking link carries their token",
  fillPlaceholders("{{bookingUrl}}", lead, extra).includes("?t=tok"),
);
check(
  "a typo'd placeholder stays visible rather than vanishing",
  fillPlaceholders("Hi {{frstName}}", lead, extra) === "Hi {{frstName}}",
);
check(
  "an unknown value renders empty rather than as the word undefined",
  fillPlaceholders("[{{meetingLink}}]", lead, { meetingLink: null }) === "[]",
);
check(
  "nurture's own call site keeps working with one extra",
  fillPlaceholders("{{resultUrl}}", lead, { resultUrl: "https://example.com/r/1" }) ===
    "https://example.com/r/1",
);
check(
  "resultUrl is blank rather than literal when nothing is passed",
  fillPlaceholders("[{{resultUrl}}]", lead) === "[]",
);

/* ------------------------------------------------------------- retention --- */

console.log("\nRetention");
check("history is kept for 30 days", RETENTION_DAYS === 30);
check(
  "the cutoff is 30 days back, not 30 hours or 30 minutes",
  retentionCutoff(Date.parse("2026-10-31T00:00:00.000Z")).toISOString() === "2026-10-01T00:00:00.000Z",
);
// The rule that stops the sweep deleting next month's reminders BY AGE. A run that has
// not fired is only ever cleared on its DUE time, never on how long ago it was made.
check(
  "a run that has not fired is NEVER prunable by age",
  !(PRUNABLE_RUN_STATUSES as readonly string[]).includes("PENDING") &&
    !(PRUNABLE_RUN_STATUSES as readonly string[]).includes("SENDING"),
);
check(
  "every finished state is prunable",
  ["SENT", "FAILED", "SKIPPED", "CANCELLED"].every((s) =>
    (PRUNABLE_RUN_STATUSES as readonly string[]).includes(s),
  ),
);

/* ----------------------------------------------------- do not disturb --- */

console.log("\nWho a suppressed contact still hears from");
// The booking's own messages. Somebody who booked a call asked for these, and
// withholding them is not consent, it is making them miss what they chose.
for (const t of ["APPOINTMENT_BOOKED", "APPOINTMENT_RESCHEDULED", "APPOINTMENT_CANCELLED", "APPOINTMENT_REMINDER"]) {
  check(`${t} still sends to a suppressed contact`, !respectsSuppression(t));
}
// The follow-ups. Outreach that happens to be triggered by a calendar.
for (const t of ["APPOINTMENT_ATTENDED", "APPOINTMENT_NO_SHOW"]) {
  check(`${t} stops at the do-not-disturb flag`, respectsSuppression(t));
}
check(
  "every trigger in the UI has a stated position on suppression",
  TRIGGERS.every((t) => typeof respectsSuppression(t.value) === "boolean"),
);

console.log("\nPlaceholders a booking message can carry");
check(
  "the manage link is offered, or a reminder cannot free its own slot",
  (APPOINTMENT_PLACEHOLDERS as readonly string[]).includes("manageUrl"),
);
check(
  "the unsubscribe link is offered on the outreach ones",
  (APPOINTMENT_PLACEHOLDERS as readonly string[]).includes("unsubscribeUrl"),
);


/* ------------------------------------------------------- too late to send --- */

console.log("\nA message that would arrive too late");
const dueAt = new Date("2026-10-22T04:30:00.000Z");

check("on time is not stale", !isStale(dueAt, dueAt.getTime()));
check("a few minutes late still sends", !isStale(dueAt, dueAt.getTime() + 5 * 60_000));
check(
  "an outage of an hour still sends",
  !isStale(dueAt, dueAt.getTime() + 60 * 60_000),
);
check(
  "just inside the window still sends",
  !isStale(dueAt, dueAt.getTime() + STALE_AFTER_MS - 60_000),
);
// The case this exists for: a feature held back for a week, then released, with every
// reminder in the backlog claiming a call is tomorrow that happened last Tuesday.
check("a day late does not send", isStale(dueAt, dueAt.getTime() + 24 * 60 * 60_000));
check("a week late does not send", isStale(dueAt, dueAt.getTime() + 7 * 24 * 60 * 60_000));
check(
  "a run due in the future is never stale",
  !isStale(new Date(dueAt.getTime() + 86_400_000), dueAt.getTime()),
);
check("the window is six hours", STALE_AFTER_MS === 6 * 60 * 60_000);

console.log("");
if (failures > 0) {
  console.error(`automations: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("automations: all checks passed");
