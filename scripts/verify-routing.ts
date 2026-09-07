/**
 * Unit checks for the conditional-routing engine (pure, no DB). Run with:
 *   npm run verify:routing
 * Mirrors the repo's tsx verify-* convention. Exits non-zero on the first failure.
 */
import {
  buildSpine,
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

console.log("");
if (failures > 0) {
  console.error(`routing engine: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("routing engine: all checks passed");
