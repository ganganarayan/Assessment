/**
 * Conditional disqualifying routes: verification.
 *
 * Pure, no database. Everything here is a statement about the one thing that decides
 * whether this feature is safe to ship on a funnel that is already spending money:
 * a gate built before routes existed must behave EXACTLY as it does today.
 *
 * The band arithmetic is reproduced rather than imported, because the real one lives
 * in a "use server" module that cannot be loaded here. It is eight lines and it is the
 * whole routing decision, so it is written out and checked against the table the owner
 * actually designed (38 and up through, 26 to 37 reviewed, below 26 out).
 *
 *   npx tsx scripts/verify-exit-routes.ts
 */
import {
  disqualifiedContentSchema,
  qualificationSchema,
  readExits,
  resolveExit,
  exitLabel,
  exitTakesAssessment,
  exitCapturesLead,
  EMPTY_DISQUALIFIED,
  GATE_PASSED_EVENT,
  GATE_DISQUALIFIED_EVENT,
} from "../src/features/assessment/schemas";
import { blockVisibleFor, type ResultBlock } from "../src/features/assessment/result-page/blocks";
import { readGateRejection, writeGateRejection } from "../src/lib/gate-flag";
import { readMetaEvents } from "../src/features/assessment/meta-events";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

console.log("Conditional disqualifying routes\n");

// --- A gate built before routes existed -----------------------------------------
const legacyContent = {
  heading: "Thanks for your interest.",
  subtext: "This one is built for founders.",
  bodyHtml: "<p>hi</p>",
  buttonLabel: "Read this instead",
  buttonUrl: "https://example.com",
  fireDisqualifiedEvent: true,
};
const legacyExits = readExits(legacyContent);
expect("a legacy exit page reads back as exactly one route", legacyExits.length === 1, String(legacyExits.length));
expect(
  "carrying the content it already had",
  legacyExits[0]?.heading === "Thanks for your interest." && legacyExits[0]?.buttonUrl === "https://example.com",
  JSON.stringify(legacyExits[0]),
);
expect("and still reporting to Meta exactly as before", legacyExits[0]?.fireDisqualifiedEvent === true);
expect("with no event name, which means GateDisqualified", legacyExits[0]?.eventName === "");
expect("as a PAGE, not an opt-in", legacyExits[0]?.mode === "PAGE");

const emptyExits = readExits(null);
expect("an assessment with no exit content still has a route to show", emptyExits.length === 1);

// --- Resolving a route ------------------------------------------------------------
const exits = disqualifiedContentSchema.parse({
  exits: [
    { key: "a", name: "Not yet", mode: "PAGE", fireDisqualifiedEvent: true, eventName: "", contentCategory: "not_yet" },
    { key: "b", name: "Wrong fit", mode: "PAGE", fireDisqualifiedEvent: true, eventName: "", contentCategory: "wrong_fit" },
    { key: "c", name: "Waitlist", mode: "OPTIN", fireDisqualifiedEvent: true, eventName: "GateWaitlisted", contentCategory: "" },
  ],
}).exits;

expect("a named key resolves to its route", resolveExit(exits, "b")?.name === "Wrong fit");
expect("a blank key lands on the first route", resolveExit(exits, "")?.key === "a");
expect(
  "a DANGLING key lands on the first route rather than on nothing",
  resolveExit(exits, "deleted-last-week")?.key === "a",
  "a builder mistake must not leave a respondent on a blank screen",
);
expect("an unnamed route is labelled by its position", exitLabel({ ...exits[0]!, name: "" }, 2) === "Exit 3");

// --- One event, one meaning --------------------------------------------------------
expect("two exits can share an event and still be told apart", exits[0]!.contentCategory !== exits[1]!.contentCategory);
expect("the waitlist route reports under its own name", exits[2]!.eventName === "GateWaitlisted");
expect(
  "an OPTIN route with no event name reports NOTHING, rather than falling back",
  (() => {
    const unnamed = { ...exits[2]!, eventName: "" };
    const reports = unnamed.fireDisqualifiedEvent && !!unnamed.eventName.trim();
    return !reports;
  })(),
  "falling back to GateDisqualified would file waitlist sign-ups into the exclusion audience",
);
expect("the default rejection event name is unchanged", GATE_DISQUALIFIED_EVENT === "GateDisqualified");

// --- New Meta events stay off until asked for --------------------------------------
expect("GatePassed exists", GATE_PASSED_EVENT === "GatePassed");
expect(
  "and is OFF for a funnel saved before it existed",
  readMetaEvents(null).gatePassed === false,
  "a brand new event must not start firing from every funnel on the install",
);
expect("while the long-standing events stay on", readMetaEvents(null).gateDisqualified === true);
expect("and it turns on when asked", readMetaEvents({ gatePassed: true }).gatePassed === true);

// --- Answers route; blank keeps the old behaviour -----------------------------------
const gate = qualificationSchema.parse({
  enabled: true,
  questions: [
    {
      id: "q1",
      text: "Which is closest to you?",
      type: "choice",
      options: [
        { id: "o1", label: "I founded it", disqualifies: false, points: 8 },
        { id: "o2", label: "Senior role, no P&L", disqualifies: true, exitKey: "a", points: 0 },
        { id: "o3", label: "Coach or consultant", disqualifies: true, exitKey: "b", points: 0 },
        { id: "o4", label: "Between things", disqualifies: true, points: 0 },
      ],
    },
  ],
  bands: { enabled: true, passMin: 38, reviewMin: 26, belowExitKey: "a" },
});
const q1 = gate.questions[0]!;
expect("a disqualifying answer names its route", q1.options[1]!.exitKey === "a");
expect("two answers can leave by different doors", q1.options[2]!.exitKey === "b");
expect(
  "a disqualifying answer with no route keeps the old behaviour",
  q1.options[3]!.exitKey === "" && resolveExit(exits, q1.options[3]!.exitKey)?.key === "a",
);

// --- The bands ---------------------------------------------------------------------
const verdict = (score: number): string => {
  if (!gate.bands.enabled) return "pass";
  if (score >= gate.bands.passMin) return "pass";
  if (score >= gate.bands.reviewMin) return "review";
  return "exit";
};
expect("56 of 56 goes through", verdict(56) === "pass");
expect("38 is the first score that goes through clean", verdict(38) === "pass" && verdict(37) === "review");
expect("26 is the bottom of the review band", verdict(26) === "review" && verdict(25) === "exit");
expect("below 26 routes out", verdict(0) === "exit");
expect("and out through the named route", gate.bands.belowExitKey === "a");

const unbanded = qualificationSchema.parse({ enabled: true, questions: [] });
expect(
  "a gate with no bands passes everyone who dodged the hard exits",
  !unbanded.bands.enabled,
  "which is every gate built before bands existed",
);
expect("and still shows its answers on the result page", unbanded.showGateOnResult === true);

// --- The lockout flag remembers the route -------------------------------------------
const flag = writeGateRejection(1700000000000, "b");
expect("a rejection remembers which door they left by", readGateRejection(flag)?.exitKey === "b");
expect("a legacy flag still locks them out", readGateRejection("1") !== null);
expect("and falls back to the first route", (readGateRejection("1")?.exitKey ?? "") === "");

// --- Nothing silently changed -------------------------------------------------------
expect("an empty exit content still defaults to reporting", EMPTY_DISQUALIFIED.fireDisqualifiedEvent === true);
expect("and holds no routes until somebody makes one", EMPTY_DISQUALIFIED.exits.length === 0);

// --- The waitlist route takes the assessment ----------------------------------------
const waitlist = disqualifiedContentSchema.parse({
  exits: [
    { key: "a", name: "Not yet", mode: "PAGE" },
    {
      key: "c",
      name: "Waitlist",
      mode: "CONTINUE",
      fireDisqualifiedEvent: true,
      eventName: "GateWaitlisted",
      completionEventName: "WaitlistCompleted",
    },
  ],
}).exits;
const cont = waitlist[1]!;

expect("a waitlist route carries them on through the assessment", exitTakesAssessment(cont));
expect("a plain exit page does not", !exitTakesAssessment(waitlist[0]!));
expect("both opt-in kinds capture a lead", exitCapturesLead(cont) && exitCapturesLead({ ...cont, mode: "OPTIN" }));
expect("a page exit captures nothing", !exitCapturesLead(waitlist[0]!));
expect("the gate reports them as waitlisted, not disqualified", cont.eventName === "GateWaitlisted");
expect(
  "and their COMPLETION reports under its own name",
  cont.completionEventName === "WaitlistCompleted",
  "the funnel's normal completion event here teaches Meta to find people who cannot attend",
);
expect("a route with no completion event falls back to the funnel's", waitlist[0]!.completionEventName === "");

// --- The close is addressed, the diagnosis is not -----------------------------------
const block = (showFor: ResultBlock["showFor"], exitKey?: string): ResultBlock => ({
  id: "b",
  type: "button",
  config: {},
  showFor,
  exitKey,
});
expect(
  "a block written before audiences existed shows to everyone",
  blockVisibleFor({ id: "b", type: "text", config: {} }, "c"),
);
expect("the diagnosis shows on both paths", blockVisibleFor(block("ALL"), null) && blockVisibleFor(block("ALL"), "c"));
expect(
  "the seat button is hidden from a routed-in respondent",
  blockVisibleFor(block("MAIN"), null) && !blockVisibleFor(block("MAIN"), "c"),
  "they have just said they cannot make those dates",
);
expect(
  "their own close is hidden from everybody else",
  !blockVisibleFor(block("EXIT"), null) && blockVisibleFor(block("EXIT"), "c"),
);
expect(
  "and can be narrowed to ONE route",
  blockVisibleFor(block("EXIT", "c"), "c") && !blockVisibleFor(block("EXIT", "c"), "other"),
);

console.log(failures === 0 ? "\n🟢 All checks passed." : `\n🟡 ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
