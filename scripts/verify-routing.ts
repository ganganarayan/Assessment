/**
 * Unit checks for the conditional-routing engine (pure, no DB). Run with:
 *   npm run verify:routing
 * Mirrors the repo's tsx verify-* convention. Exits non-zero on the first failure.
 */
import {
  buildSpine,
  defaultRouteOf,
  hasRouting,
  nextIndex,
  walk,
  type RouteSpec,
  type SpineQuestion,
} from "../src/lib/routing/engine";

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

// --- buildSpine: page 1 before page 2, displayOrder preserved within each page ---
const categories = [
  { id: "c1", page: 1, questions: [{ id: "q1" }, { id: "q2" }] },
  { id: "c2", page: 2, questions: [{ id: "q5" }] },
  { id: "c3", page: 1, questions: [{ id: "q3" }, { id: "q4" }] },
];
const spine = buildSpine(categories);
check(
  "buildSpine orders page-1 categories before page-2, in displayOrder",
  spine.map((s) => s.id).join(",") === "q1,q2,q3,q4,q5",
);

const NEXT = (): RouteSpec => ({ action: "NEXT", targetQuestionId: null, targetCategoryId: null });
const jumpQ = (id: string): RouteSpec => ({ action: "JUMP_TO_QUESTION", targetQuestionId: id, targetCategoryId: null });
const jumpC = (id: string): RouteSpec => ({ action: "JUMP_TO_CATEGORY", targetQuestionId: null, targetCategoryId: id });
const end = (): RouteSpec => ({ action: "SKIP_TO_END", targetQuestionId: null, targetCategoryId: null });

const simple: SpineQuestion[] = [
  { id: "q1", categoryId: "c1" },
  { id: "q2", categoryId: "c1" },
  { id: "q3", categoryId: "c2" },
  { id: "q4", categoryId: "c2" },
];

// --- nextIndex ---
check("no route / unanswered -> linear next", nextIndex(0, undefined, simple, new Map()) === 1);
check("last question, no route -> END", nextIndex(3, undefined, simple, new Map()) === "END");
check("NEXT route -> linear next", nextIndex(0, "o1", simple, new Map([["o1", NEXT()]])) === 1);
check("SKIP_TO_END -> END", nextIndex(0, "o1", simple, new Map([["o1", end()]])) === "END");
check("JUMP_TO_QUESTION forward", nextIndex(0, "o1", simple, new Map([["o1", jumpQ("q4")]])) === 3);
check(
  "JUMP_TO_QUESTION backward degrades to linear",
  nextIndex(2, "o1", simple, new Map([["o1", jumpQ("q1")]])) === 3,
);
check(
  "JUMP_TO_QUESTION to unknown target degrades to linear",
  nextIndex(0, "o1", simple, new Map([["o1", jumpQ("nope")]])) === 1,
);
check(
  "JUMP_TO_CATEGORY jumps to that category's first forward question",
  nextIndex(0, "o1", simple, new Map([["o1", jumpC("c2")]])) === 2,
);

// --- walk: reached set excludes skipped questions ---
// q1 answered with a jump to q4 (skips q2, q3); q4 answered (terminal).
const routes = new Map<string, RouteSpec>([["q1-jump", jumpQ("q4")]]);
const answers1 = new Map<string, string>([["q1", "q1-jump"], ["q4", "q4-a"]]);
const w1 = walk(answers1, simple, routes);
check("walk: jump skips intermediate questions", [...w1.reachedSet].sort().join(",") === "q1,q4");
check("walk: skipped question is not reached", !w1.reachedSet.has("q2") && !w1.reachedSet.has("q3"));

// Linear walk with no routes reaches everything answered-through.
const w2 = walk(new Map([["q1", "a"], ["q2", "a"], ["q3", "a"], ["q4", "a"]]), simple, new Map());
check("walk: no routes reaches all questions", w2.reached.length === 4);

// SKIP_TO_END terminates the walk early.
const w3 = walk(new Map([["q1", "q1-end"]]), simple, new Map([["q1-end", end()]]));
check("walk: SKIP_TO_END stops after the terminal question", [...w3.reachedSet].join(",") === "q1");

// Unanswered mid-flow question advances linearly (does not strand the walk).
const w4 = walk(new Map([["q1", "a"], ["q3", "a"]]), simple, new Map());
check("walk: unanswered question advances linearly", w4.reached.length === 4);

// ---------------------------------------------------------------------------
// DEFAULT (unconditional) routes - the half of branching that rejoins a branch.
//
// Shape under test, which is the exit-survey shape: one branching question, two
// branches of one question each, and a shared tail that both branches must reach
// WITHOUT falling through into the other branch.
//   q1 (branch on answer) | b1 | b2 | tail
// ---------------------------------------------------------------------------
const branchy: SpineQuestion[] = [
  { id: "q1", categoryId: "ask" },
  { id: "b1", categoryId: "br1", defaultRoute: jumpC("tail") },
  { id: "b2", categoryId: "br2", defaultRoute: jumpC("tail") },
  { id: "t1", categoryId: "tail" },
];
const branchRoutes = new Map<string, RouteSpec>([
  ["o-one", jumpC("br1")],
  ["o-two", jumpC("br2")],
]);

check(
  "default route applies when the question is skipped",
  nextIndex(1, undefined, branchy, branchRoutes) === 3,
);
check(
  "default route applies when the chosen option carries no rule",
  nextIndex(1, "some-unrouted-option", branchy, branchRoutes) === 3,
);
check(
  "an option rule still beats the default route",
  nextIndex(0, "o-two", branchy, branchRoutes) === 2,
);
check(
  "a backward default route degrades to linear rather than looping",
  nextIndex(2, undefined, [
    { id: "x1", categoryId: "a" },
    { id: "x2", categoryId: "a" },
    { id: "x3", categoryId: "a", defaultRoute: jumpQ("x1") },
    { id: "x4", categoryId: "a" },
  ], new Map()) === 3,
);

// Branch 1: answered q1 with the branch-1 option, answered b1. The tail must be
// reached and branch 2 must NOT be - the bug this phase exists to fix.
const wb1 = walk(new Map([["q1", "o-one"], ["b1", "x"]]), branchy, branchRoutes);
check("walk: branch 1 rejoins the tail", wb1.reachedSet.has("t1"));
check("walk: branch 1 never enters branch 2", !wb1.reachedSet.has("b2"));

// Branch 1 SKIPPED (an optional follow-up, or a typed one left blank) still rejoins.
const wb1skip = walk(new Map([["q1", "o-one"]]), branchy, branchRoutes);
check("walk: a skipped branch question still rejoins the tail", wb1skip.reachedSet.has("t1"));
check("walk: a skipped branch question does not leak into branch 2", !wb1skip.reachedSet.has("b2"));

// A FREE_TEXT branch question has no option at all - same path, by construction.
const wb2 = walk(new Map([["q1", "o-two"]]), branchy, branchRoutes);
check(
  "walk: branch 2 (typed, no option chosen) rejoins the tail",
  wb2.reachedSet.has("t1") && !wb2.reachedSet.has("b1"),
);

// --- hasRouting: default routes alone are enough to make routing active ---
check("hasRouting: nothing configured -> false", !hasRouting(simple, new Map()));
check("hasRouting: an option rule -> true", hasRouting(simple, new Map([["o1", end()]])));
check("hasRouting: a default route alone -> true", hasRouting(branchy, new Map()));
check(
  "hasRouting: a default route of NEXT is not routing",
  !hasRouting([{ id: "z1", categoryId: "a", defaultRoute: NEXT() }], new Map()),
);

// --- defaultRouteOf: the column triple -> a RouteSpec ---
check("defaultRouteOf: no action -> null", defaultRouteOf({ defaultRouteAction: null }) === null);
check(
  "defaultRouteOf: maps the category target through",
  defaultRouteOf({ defaultRouteAction: "JUMP_TO_CATEGORY", defaultTargetCategoryId: "tail" })
    ?.targetCategoryId === "tail",
);

// --- buildSpine carries the default route onto the spine ---
const spineWithDefaults = buildSpine([
  { id: "c1", page: 1, questions: [{ id: "q1", defaultRoute: jumpC("c2") }] },
  { id: "c2", page: 1, questions: [{ id: "q2" }] },
]);
check(
  "buildSpine carries defaultRoute onto the spine",
  spineWithDefaults[0]?.defaultRoute?.targetCategoryId === "c2" &&
    spineWithDefaults[1]?.defaultRoute === null,
);

console.log("");
if (failures > 0) {
  console.error(`routing engine: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("routing engine: all checks passed");
