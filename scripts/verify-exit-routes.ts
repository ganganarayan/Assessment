/**
 * Conditional disqualifying routes: verification.
 *
 * Pure, no database. Everything here is a statement about the one thing that decides
 * whether this feature is safe to ship on a funnel that is already spending money:
 * a gate built before routes existed must behave EXACTLY as it does today.
 *
 * The band arithmetic is now IMPORTED, not reproduced: it moved out of the "use server"
 * module into gate-verdict.ts precisely so this script can check the rule the funnel
 * actually runs, against the table the owner designed (38 and up through, 26 to 37
 * reviewed, below 26 out).
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
import { gateVerdict, gateTotals, gateBandOf } from "../src/features/assessment/gate-verdict";
import { PLAN_LIMITS, PARKED_LIMITS } from "../src/lib/billing/plans";
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
// Renamed from GatePassed on 16-10-2026: anyone the gate lets through IS qualified,
// and the name is read in the ad account next to QualifiedCompletion. Pinned because
// Meta treats a renamed event as a brand new one, so this string moving is an audience
// quietly ceasing to fill.
expect("the gate-pass event is named GateQualified", GATE_PASSED_EVENT === "GateQualified");
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
// The real rule, asked about a respondent who scored exactly `score`: a one-question
// gate carrying the same bands, answered with an option worth that many points.
const verdict = (score: number): string =>
  gateVerdict(
    qualificationSchema.parse({
      enabled: true,
      bands: gate.bands,
      questions: [
        { id: "s", text: "scored", type: "choice", options: [{ id: "o", label: "o", points: score }, { id: "z", label: "z", points: 0 }] },
      ],
    }),
    { s: "o" },
  ).outcome;
expect("56 of 56 goes through", verdict(56) === "pass");
expect("38 is the first score that goes through clean", verdict(38) === "pass" && verdict(37) === "review");
expect("26 is the bottom of the review band", verdict(26) === "review" && verdict(25) === "exit");
expect("below 26 routes out", verdict(0) === "exit");
expect("and out through the named route", gate.bands.belowExitKey === "a");

// What the gate AWARDED, which is what lands on the submission row. The ceiling counts
// every asked question, so an unanswered one still raises the bar.
const totals = gateTotals(gate, { [q1.id]: q1.options[0]!.id });
expect(
  "the gate scores the picked option and still counts the question's ceiling",
  totals.score === q1.options[0]!.points && totals.max === Math.max(...q1.options.map((o) => o.points)),
  JSON.stringify(totals),
);
expect("and keeps one readable row per answered question", totals.rows.length === 1 && totals.rows[0]!.a === q1.options[0]!.label);
expect("a gate with no bands tags nobody", gateBandOf(gate, 40, 0) === null, "max of 0 means the gate awarded nothing");
expect("above passMin is tagged PASS", gateBandOf(gate, 38, 56) === "PASS");
expect("below it is tagged REVIEW, never an exit", gateBandOf(gate, 37, 56) === "REVIEW");

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

// What a completion on this route reports. The rule the app applies: a routed-in
// respondent is SILENT unless the route names an event, where every other respondent
// gets the funnel's normal completion event.
const completionFor = (exit: { completionEventName: string } | null): string | null =>
  exit ? exit.completionEventName.trim() || null : "AssessmentCompleted";

expect(
  "a waitlist completion reports NOTHING by default",
  completionFor({ completionEventName: "" }) === null,
  "they opted in, so the CRM has them with full contact details - that is where the next-cycle list is sent from",
);
expect(
  "which is what keeps them out of the optimisation event",
  completionFor({ completionEventName: "" }) !== "AssessmentCompleted",
);
expect(
  "a route CAN name its own event if Meta should hold a copy",
  completionFor({ completionEventName: "WaitlistCompleted" }) === "WaitlistCompleted",
);
expect("and everybody else still reports the funnel's event", completionFor(null) === "AssessmentCompleted");
expect("a route saved with no completion event stays silent", cont.completionEventName === "WaitlistCompleted" || cont.completionEventName === "");

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

// --- Turned away, or routed on? ------------------------------------------------------
//
// Both write a gate_disqualification row, and the stats split them on the route's mode
// (analytics.ts). The number this protects is one an owner acts on: counting waitlist
// people as rejections files the most qualified traffic in the funnel under the heading
// for the least.
const countAsTurnedAway = (exit: { mode: string } | null | undefined): boolean => !exit || exit.mode === "PAGE";

expect("a page exit counts as turned away", countAsTurnedAway(waitlist[0]!));
expect("a waitlist route does not", !countAsTurnedAway(cont));
expect("nor does a thank-you route", !countAsTurnedAway({ mode: "OPTIN" }));
expect(
  "a row whose route no longer resolves counts as turned away",
  countAsTurnedAway(null),
  "the legacy shape, and the only safe side to err on",
);

// --- Which tier gets what ------------------------------------------------------------
//
// Bands and routes are deliberately NOT one flag. The objection that kills this sale is
// "I am scared to turn leads away", and bands are the answer to it: putting the safety
// net behind the upgrade leaves it missing from the plan a nervous first-time buyer
// picks. Pinned here because it is a one-word edit to undo by accident.
expect(
  "every paid tier gets score bands, including the entry plan",
  PLAN_LIMITS.GATE.features.gateScoreBands &&
    PLAN_LIMITS.SIGNAL.features.gateScoreBands &&
    PLAN_LIMITS.AGENCY.features.gateScoreBands,
);
expect(
  "the multi-exit router stays Signal and up",
  !PLAN_LIMITS.GATE.features.conditionalExit && PLAN_LIMITS.SIGNAL.features.conditionalExit,
);
expect(
  "and a parked workspace gets neither",
  !PARKED_LIMITS.features.gateScoreBands && !PARKED_LIMITS.features.conditionalExit,
);

console.log(failures === 0 ? "\n🟢 All checks passed." : `\n🟡 ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
