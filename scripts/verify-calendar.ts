/**
 * Unit checks for the booking calendar's arithmetic (pure, no DB). Run with:
 *   npm run verify:calendar
 *
 * The slot math is the part of this feature that cannot be eyeballed: an off-by-330
 * minutes bug renders a perfectly plausible page offering the wrong hours, and the
 * first person to notice is a respondent who turns up at the wrong time. So the IST
 * conversion, the window algebra, the buffer, the notice window, the per-day cap, the
 * slot lock and the ICS escaping are all checked here, against the SAME functions the
 * public page and the booking action call.
 *
 * Exits non-zero on the first failure, like the other verify-* scripts.
 */
import {
  IST_OFFSET_MIN,
  addDays,
  calendarKey,
  calendarOwnerKey,
  daySlots,
  hhmmToMinutes,
  horizonDateKeys,
  isDateKey,
  istDateKey,
  istMinutesOfDay,
  istWeekday,
  mergeOwnerSlots,
  minutesToHHMM,
  pickRoundRobin,
  slotLockFor,
  stampBookingUrl,
  utcMsFor,
  windowsForDate,
  type SlotExceptionInput,
  type SlotRuleInput,
} from "../src/lib/calendar/slots";
import { buildIcsCalendar } from "../src/lib/calendar/ics";
import { buildState, parseState, STATE_TTL_MS } from "../src/lib/google/state";

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

/* ------------------------------------------------------------------- IST --- */

console.log("IST conversion");
check("the offset is UTC+5:30", IST_OFFSET_MIN === 330);
// 2026-10-20T18:45Z is 00:15 IST on the 21st. The case that catches a UTC-dated grid.
check(
  "an evening UTC instant belongs to the NEXT IST day",
  istDateKey(Date.parse("2026-10-20T18:45:00.000Z")) === "2026-10-21",
);
check(
  "minutes of day are IST minutes",
  istMinutesOfDay(Date.parse("2026-10-20T04:30:00.000Z")) === 10 * 60,
);
check("utcMsFor is the inverse", utcMsFor("2026-10-20", 600) === Date.parse("2026-10-20T04:30:00.000Z"));
check("20-10-2026 is a Tuesday", istWeekday("2026-10-20") === 2);
check("addDays crosses a month end", addDays("2026-10-31", 1) === "2026-11-01");
check("isDateKey rejects the 31st of February", !isDateKey("2026-02-31"));
check("isDateKey accepts a real date", isDateKey("2026-02-28"));
check("minutesToHHMM pads", minutesToHHMM(570) === "09:30" && minutesToHHMM(0) === "00:00");
check("hhmmToMinutes parses and rejects", hhmmToMinutes("09:30") === 570 && hhmmToMinutes("9:75") === null);
check("hhmmToMinutes accepts 24:00 as an end of day", hhmmToMinutes("24:00") === 1440);
check("the horizon starts today and is as long as asked", horizonDateKeys(Date.parse("2026-10-20T06:00:00.000Z"), 3).join(",") === "2026-10-20,2026-10-21,2026-10-22");

/* --------------------------------------------------------------- windows --- */

console.log("\nAvailability windows");
const tuesday: SlotRuleInput[] = [{ weekday: 2, startMin: 600, endMin: 780 }]; // Tue 10:00-13:00

check(
  "a weekly rule applies on its weekday only",
  windowsForDate("2026-10-20", tuesday, []).length === 1 && windowsForDate("2026-10-21", tuesday, []).length === 0,
);

const dayOff: SlotExceptionInput[] = [{ dateKey: "2026-10-20", kind: "BLOCK", startMin: null, endMin: null }];
check("a whole-day BLOCK clears the day", windowsForDate("2026-10-20", tuesday, dayOff).length === 0);

const lunch: SlotExceptionInput[] = [{ dateKey: "2026-10-20", kind: "BLOCK", startMin: 660, endMin: 720 }];
const split = windowsForDate("2026-10-20", tuesday, lunch);
check(
  "a partial BLOCK splits the window in two",
  split.length === 2 && split[0]?.endMin === 660 && split[1]?.startMin === 720,
);

const opened: SlotExceptionInput[] = [{ dateKey: "2026-10-25", kind: "OPEN", startMin: 540, endMin: 600 }];
check(
  "an OPEN exception adds a window on a day with no rule",
  windowsForDate("2026-10-25", tuesday, opened).length === 1,
);

// The ordering rule that matters: a day off has to beat hours opened for that date,
// including hours added afterwards, or a holiday silently leaks slots.
const bothWays: SlotExceptionInput[] = [
  { dateKey: "2026-10-20", kind: "OPEN", startMin: 540, endMin: 600 },
  { dateKey: "2026-10-20", kind: "BLOCK", startMin: null, endMin: null },
];
check("a day off beats hours opened for the same date", windowsForDate("2026-10-20", tuesday, bothWays).length === 0);

check(
  "touching windows merge",
  windowsForDate(
    "2026-10-20",
    [
      { weekday: 2, startMin: 600, endMin: 660 },
      { weekday: 2, startMin: 660, endMin: 720 },
    ],
    [],
  ).length === 1,
);

/* ----------------------------------------------------------------- slots --- */

console.log("\nSlots");
// Monday 19-10-2026 06:00 IST, so the Tuesday is a clear day ahead of any notice window.
const now = Date.parse("2026-10-19T00:30:00.000Z");
const base = {
  dateKey: "2026-10-20",
  rules: tuesday,
  exceptions: [] as SlotExceptionInput[],
  busy: [],
  durationMin: 30,
  bufferMin: 0,
  slotStepMin: 0,
  noticeMin: 120,
  nowMs: now,
  horizonDays: 30,
  maxPerDay: null,
  bookedCountOnDay: 0,
};

const plain = daySlots(base);
check("a 3-hour window at 30 minutes gives 6 slots", plain.length === 6);
check("the first slot is 10:00 IST", minutesToHHMM(istMinutesOfDay(plain[0]!.startMs)) === "10:00");
check("the last slot STARTS at 12:30, so it ends inside the window", minutesToHHMM(istMinutesOfDay(plain[5]!.startMs)) === "12:30");

check(
  "a 15-minute gap after each call gives 4 slots, not 6",
  daySlots({ ...base, bufferMin: 15 }).length === 4,
);
check(
  "an explicit step overrides length plus gap",
  daySlots({ ...base, bufferMin: 15, slotStepMin: 30 }).length === 6,
);

// A booking at 11:00 takes 11:00, and with a buffer it takes the slots around it too.
const busyAt11 = [{ startMs: utcMsFor("2026-10-20", 660), endMs: utcMsFor("2026-10-20", 690) }];
const around = daySlots({ ...base, busy: busyAt11 }).map((s) => minutesToHHMM(istMinutesOfDay(s.startMs)));
check("an existing booking removes exactly its own slot", !around.includes("11:00") && around.length === 5);
check(
  "the buffer protects BOTH sides of an existing booking",
  !daySlots({ ...base, bufferMin: 15, busy: busyAt11 })
    .map((s) => minutesToHHMM(istMinutesOfDay(s.startMs)))
    .some((t) => t === "10:45" || t === "11:00" || t === "11:30"),
);

check(
  "the notice window hides slots that are too soon",
  // Tuesday 09:00 IST with 120 minutes' notice: nothing before 11:00 survives, so the
  // 10:00 and 10:30 slots go and four remain.
  daySlots({ ...base, nowMs: Date.parse("2026-10-20T03:30:00.000Z") })
    .map((s) => minutesToHHMM(istMinutesOfDay(s.startMs)))
    .join(",") === "11:00,11:30,12:00,12:30",
);
check(
  "a notice window past the last slot leaves the day empty",
  daySlots({ ...base, nowMs: Date.parse("2026-10-20T06:00:00.000Z") }).length === 0,
);
check("yesterday offers nothing", daySlots({ ...base, dateKey: "2026-10-13" }).length === 0);
check(
  "past the horizon offers nothing",
  daySlots({ ...base, dateKey: "2026-11-24", horizonDays: 7 }).length === 0,
);
check(
  "a day at its cap offers nothing",
  daySlots({ ...base, maxPerDay: 2, bookedCountOnDay: 2 }).length === 0,
);
check(
  "a day under its cap is unaffected",
  daySlots({ ...base, maxPerDay: 3, bookedCountOnDay: 2 }).length === 6,
);
check("a zero-length call offers nothing rather than looping", daySlots({ ...base, durationMin: 0 }).length === 0);

/* ------------------------------------------------------------- slot lock --- */

console.log("\nDouble-booking guard");
const lockA = slotLockFor("tnt_1", "usr_asha", new Date(utcMsFor("2026-10-20", 600)));
check(
  "the lock is the same string for the same calendar and instant",
  lockA === slotLockFor("tnt_1", "usr_asha", utcMsFor("2026-10-20", 600)),
);
check(
  "another workspace at the same instant is a different lock",
  lockA !== slotLockFor("tnt_2", "usr_asha", utcMsFor("2026-10-20", 600)),
);
check(
  "a different time is a different lock",
  lockA !== slotLockFor("tnt_1", "usr_asha", utcMsFor("2026-10-20", 630)),
);
// The point of per-staff calendars: two people CAN hold the same hour, and one of them
// cannot hold it twice - including through two different booking links of their own.
check(
  "a second staff member can hold the same instant",
  lockA !== slotLockFor("tnt_1", "usr_bina", utcMsFor("2026-10-20", 600)),
);
check(
  "the shared calendar is its own diary, not everybody's",
  lockA !== slotLockFor("tnt_1", null, utcMsFor("2026-10-20", 600)) &&
    slotLockFor("tnt_1", null, utcMsFor("2026-10-20", 600)) ===
      slotLockFor("tnt_1", undefined, utcMsFor("2026-10-20", 600)),
);
check(
  "the calendar key is what the lock is built from",
  lockA.startsWith(calendarKey("tnt_1", "usr_asha")),
);

/* ------------------------------------------------------------------- ics --- */

console.log("\niCalendar");
const ics = buildIcsCalendar("Acme bookings", [
  {
    uid: "appointment-apt_1@assess360",
    startMs: utcMsFor("2026-10-20", 600),
    endMs: utcMsFor("2026-10-20", 630),
    summary: "Strategy call with Ganesh; Kumar, Jr",
    description: "Line one\nLine two",
    location: "https://meet.example.com/x",
    status: "CONFIRMED",
    attendeeEmail: "ganesh@example.com",
  },
]);
check("the calendar is wrapped and closed", ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.trimEnd().endsWith("END:VCALENDAR"));
check("lines are CRLF terminated", ics.includes("\r\n") && !/[^\r]\n/.test(ics));
check("the start is a UTC stamp", ics.includes("DTSTART:20261020T043000Z"));
check("a semicolon in a name is escaped", ics.includes("Ganesh\\; Kumar\\, Jr"));
check("a newline in a note becomes the literal escape", ics.includes("Line one\\nLine two"));
check("the attendee rides along", ics.includes("ATTENDEE:mailto:ganesh@example.com"));

// A long summary has to fold, and every continuation line starts with one space.
const long = buildIcsCalendar(
  "Acme",
  [
    {
      uid: "appointment-apt_2@assess360",
      startMs: utcMsFor("2026-10-20", 600),
      endMs: utcMsFor("2026-10-20", 630),
      summary: "x".repeat(200),
    },
  ],
);
const folded = long.split("\r\n").filter((l) => l.startsWith(" "));
check("a long line folds with leading-space continuations", folded.length >= 2);
check(
  "no folded line exceeds 75 octets",
  long.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75),
);
check(
  "a cancelled appointment stays in the feed, marked",
  buildIcsCalendar("Acme", [
    {
      uid: "u@assess360",
      startMs: utcMsFor("2026-10-20", 600),
      endMs: utcMsFor("2026-10-20", 630),
      summary: "Called off",
      status: "CANCELLED",
    },
  ]).includes("STATUS:CANCELLED"),
);

/* ------------------------------------------------------- google oauth --- */

console.log("\nGoogle OAuth state");
const SECRET = "test-secret-not-a-real-one";
const OTHER = "a-different-secret";
const issued = Date.parse("2026-10-21T06:00:00.000Z");
const good = buildState(
  { tenantId: "tnt_1", calendarKey: "usr_asha", returnTo: "/w/calendar/availability", issuedAtMs: issued },
  SECRET,
);

const round = parseState(good, SECRET, issued + 1000);
check("a state we issued round-trips", round?.tenantId === "tnt_1" && round?.calendarKey === "usr_asha");

// The whole point of signing it: the callback decides WHICH workspace and WHICH
// calendar the tokens are stored against, from this value alone.
const tampered = buildState(
  { tenantId: "tnt_victim", calendarKey: "shared", returnTo: "/w/calendar/availability", issuedAtMs: issued },
  OTHER,
);
check("a state signed with another secret is refused", parseState(tampered, SECRET, issued + 1000) === null);
check(
  "flipping a character in the payload is refused",
  parseState(`x${good.slice(1)}`, SECRET, issued + 1000) === null,
);
check("a state with no signature at all is refused", parseState("justapayload", SECRET, issued) === null);
check("an empty state is refused", parseState("", SECRET, issued) === null);

// A consent screen left open overnight is a dead link, not a replay.
check(
  "a state older than its window is refused",
  parseState(good, SECRET, issued + STATE_TTL_MS + 1000) === null,
);
check("a state from the future is refused", parseState(good, SECRET, issued - 120_000) === null);
check("a state inside its window is accepted", parseState(good, SECRET, issued + STATE_TTL_MS - 1000) !== null);

// The other way this parameter gets abused: bounce somebody off our domain to theirs.
const offsite = buildState(
  { tenantId: "tnt_1", calendarKey: "shared", returnTo: "https://evil.example.com/steal", issuedAtMs: issued },
  SECRET,
);
check(
  "an absolute returnTo is replaced, never followed",
  parseState(offsite, SECRET, issued)?.returnTo === "/w/calendar/availability",
);
const protocolRelative = buildState(
  { tenantId: "tnt_1", calendarKey: "shared", returnTo: "//evil.example.com", issuedAtMs: issued },
  SECRET,
);
check(
  "a protocol-relative returnTo is replaced too",
  parseState(protocolRelative, SECRET, issued)?.returnTo === "/w/calendar/availability",
);
check(
  "an ordinary local path survives",
  parseState(
    buildState({ tenantId: "t", calendarKey: "shared", returnTo: "/admin/calendar/availability", issuedAtMs: issued }, SECRET),
    SECRET,
    issued,
  )?.returnTo === "/admin/calendar/availability",
);

console.log("\nWhich diary a Google connection belongs to");
check(
  "a staff member’s calendar key is their id",
  calendarOwnerKey("usr_asha") === "usr_asha",
);
check("the shared calendar's key is the literal shared", calendarOwnerKey(null) === "shared");
check(
  "the key matches the half the slot lock uses",
  calendarKey("tnt_1", "usr_asha") === `tnt_1:${calendarOwnerKey("usr_asha")}`,
);


/* ----------------------------------------------- result-page booking CTA --- */

console.log("\nStamping a booking link on the result page");
const TOK = "tok_abc123";

check(
  "a relative booking link gets the token and stays relative",
  stampBookingUrl("/b/strategy-call", TOK) === "/b/strategy-call?t=tok_abc123",
);
check(
  "an absolute booking link keeps its host",
  stampBookingUrl("https://acme.example.com/b/strategy-call", TOK) ===
    "https://acme.example.com/b/strategy-call?t=tok_abc123",
);
check(
  "a trailing slash is still a booking link",
  (stampBookingUrl("/b/strategy-call/", TOK) ?? "").includes("t=tok_abc123"),
);
check(
  "a link that already names a token is left exactly alone",
  stampBookingUrl("/b/strategy-call?t=theirs", TOK) === "/b/strategy-call?t=theirs",
);

// 🔴 The one that matters: a token identifies a person, and a page that is not ours
// must never be handed one.
check(
  "a link to somebody else's site is untouched",
  stampBookingUrl("https://calendly.com/acme/30min", TOK) === "https://calendly.com/acme/30min",
);
check(
  "an assessment link is untouched - only /b/ is a booking page",
  stampBookingUrl("/a/emotional-stability", TOK) === "/a/emotional-stability",
);
check(
  "a deeper path that merely starts with /b/ is untouched",
  stampBookingUrl("/b/strategy-call/extra", TOK) === "/b/strategy-call/extra",
);
check("a blank link stays null", stampBookingUrl("", TOK) === null);
check("no token means no stamp", stampBookingUrl("/b/strategy-call", "") === "/b/strategy-call");
check("an unparseable link is returned as it came", stampBookingUrl("not a url", TOK) === "not a url");
check(
  "other query parameters survive the stamp",
  (stampBookingUrl("/b/call?utm_source=fb", TOK) ?? "").includes("utm_source=fb"),
);


/* ------------------------------------------------------- team booking --- */

console.log("\nA team link's open slots");
const at = (min: number) => ({ startMs: utcMsFor("2026-10-20", min), endMs: utcMsFor("2026-10-20", min + 30) });

// Asha is free at 10:00 and 11:00; Bina at 11:00 and 12:00. The link offers all three.
const team = mergeOwnerSlots([
  { owner: "asha", slots: [at(600), at(660)] },
  { owner: "bina", slots: [at(660), at(720)] },
]);
check("the union is every time somebody is free", team.length === 3);
check("the slots come back in order", team.map((s) => s.startMs).every((v, i, a) => i === 0 || a[i - 1]! < v));
check(
  "a time only one person has free carries only that person",
  team.find((s) => s.startMs === utcMsFor("2026-10-20", 600))?.freeOwners.join() === "asha",
);
check(
  "a time both have free carries both - that is the capacity",
  (team.find((s) => s.startMs === utcMsFor("2026-10-20", 660))?.freeOwners.length ?? 0) === 2,
);
check("nobody free anywhere is no slots", mergeOwnerSlots([{ owner: "asha", slots: [] }]).length === 0);
check(
  "one person is simply a team of one",
  mergeOwnerSlots([{ owner: "shared", slots: [at(600)] }]).length === 1,
);

console.log("\nWhose turn it is");
const never = { asha: null, bina: null, cara: null };
check(
  "with nobody assigned yet it is deterministic, not random",
  pickRoundRobin(["bina", "asha", "cara"], never) === "asha" &&
    pickRoundRobin(["cara", "bina", "asha"], never) === "asha",
);
check(
  "the longest waiting goes first",
  pickRoundRobin(["asha", "bina"], { asha: 2_000, bina: 1_000 }) === "bina",
);
check(
  "somebody never assigned beats everybody who has been",
  pickRoundRobin(["asha", "bina"], { asha: 1_000, bina: null }) === "bina",
);
// 🔴 The reason the cursor is a timestamp and not a counter: being skipped must leave
// you at the FRONT of the queue, not send you round another lap.
check(
  "being passed over leaves you first next time",
  pickRoundRobin(["asha", "cara"], { asha: 500, bina: 400, cara: 900 }) === "asha",
);
check(
  "only people actually free are considered",
  pickRoundRobin(["cara"], { asha: 1, bina: 2, cara: 3 }) === "cara",
);
// What the booking retry does when the database refuses the first choice.
check(
  "an excluded member is passed over",
  pickRoundRobin(["asha", "bina"], { asha: 1_000, bina: 2_000 }, ["asha"]) === "bina",
);
check(
  "everybody excluded means nobody, not a crash",
  pickRoundRobin(["asha"], { asha: 1_000 }, ["asha"]) === null,
);
check("no free members means nobody", pickRoundRobin([], never) === null);

console.log("\nTwo people booking the same minute on a team link");
// The lock is keyed on the calendar, so two different members at one instant are two
// different locks and BOTH commit. That is the capacity a team page sells.
check(
  "two members can hold the same instant",
  slotLockFor("tnt_1", "asha", utcMsFor("2026-10-20", 660)) !==
    slotLockFor("tnt_1", "bina", utcMsFor("2026-10-20", 660)),
);
check(
  "the same member cannot hold it twice",
  slotLockFor("tnt_1", "asha", utcMsFor("2026-10-20", 660)) ===
    slotLockFor("tnt_1", "asha", utcMsFor("2026-10-20", 660)),
);

console.log("");
if (failures > 0) {
  console.error(`calendar: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("calendar: all checks passed");
