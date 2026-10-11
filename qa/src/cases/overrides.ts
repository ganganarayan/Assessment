/**
 * The file where the owner gets the last word.
 *
 * Almost all of the time the generated cases are right, because they come from the
 * funnel itself. The exceptions are real though: a case that should be skipped on this
 * funnel, an expectation the owner wants PINNED so that changing the funnel breaks the
 * run rather than quietly changing the expectation with it, and the specific
 * combination of answers somebody is worried about and wants driven every time.
 *
 * So qa/cases/<slug>.yaml is read on every run when it exists, and written on request
 * with every generated case listed and commented out, which is the only documentation
 * of this file anybody will actually read.
 *
 * Answers may be given as option ids OR as the labels on screen, because nobody knows
 * their own option ids.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { QA_ROOT } from "../env.js";
import type { Funnel } from "../config/read.js";
import type { CasePlan, Behaviour, Expectation } from "../oracle/types.js";
import type { GeneratedCase } from "./generate.js";

export interface ExpectOverride {
  exitKey?: string | null;
  exitMode?: "PAGE" | "OPTIN" | "CONTINUE" | null;
  lead?: boolean;
  submission?: boolean;
  completed?: boolean;
  gateEntry?: boolean;
  disqualification?: boolean;
  bandTitle?: string | null;
  percent?: number;
  terminal?: Expectation["terminal"];
  events?: { fires?: string[]; never?: string[] };
}

export interface HandWrittenCase {
  id: string;
  title?: string;
  audienceRole?: string;
  audienceText?: string;
  gate?: Record<string, string>;
  answers?: Record<string, string>;
  behaviours?: Behaviour[];
  expect?: ExpectOverride;
}

export interface Overrides {
  path: string;
  exists: boolean;
  skip: string[];
  only: string[];
  expect: Record<string, ExpectOverride>;
  cases: HandWrittenCase[];
}

const EMPTY: Omit<Overrides, "path" | "exists"> = { skip: [], only: [], expect: {}, cases: [] };

export function overridesPath(slug: string): string {
  return join(QA_ROOT, "cases", `${slug}.yaml`);
}

export function loadOverrides(slug: string): Overrides {
  const path = overridesPath(slug);
  if (!existsSync(path)) return { path, exists: false, ...EMPTY };
  const raw = parse(readFileSync(path, "utf8")) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return { path, exists: true, ...EMPTY };
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    path,
    exists: true,
    skip: arr(raw.skip),
    only: arr(raw.only),
    expect: (raw.expect ?? {}) as Record<string, ExpectOverride>,
    cases: Array.isArray(raw.cases) ? (raw.cases as HandWrittenCase[]) : [],
  };
}

/* ---------- applying it -------------------------------------------------------- */

/** Resolve an answer written as an option id OR as the label on screen. */
function resolveGatePick(funnel: Funnel, questionRef: string, optionRef: string): [string, string] | null {
  const q =
    funnel.qualification.questions.find((x) => x.id === questionRef) ??
    funnel.qualification.questions.find((x) => x.text.trim().toLowerCase() === questionRef.trim().toLowerCase());
  if (!q) return null;
  const o =
    q.options.find((x) => x.id === optionRef) ??
    q.options.find((x) => x.label.trim().toLowerCase() === optionRef.trim().toLowerCase());
  if (!o) return null;
  return [q.id, o.id];
}

function resolveAnswer(funnel: Funnel, questionRef: string, optionRef: string): [string, string] | null {
  for (const c of funnel.row.categories) {
    for (const q of c.questions) {
      const matches = q.id === questionRef || q.text.trim().toLowerCase() === questionRef.trim().toLowerCase();
      if (!matches) continue;
      const o =
        q.options.find((x) => x.id === optionRef) ??
        q.options.find((x) => x.label.trim().toLowerCase() === optionRef.trim().toLowerCase());
      return o ? [q.id, o.id] : null;
    }
  }
  return null;
}

function resolveRole(funnel: Funnel, ref: string): string | undefined {
  const role =
    funnel.audience.roles.find((r) => r.id === ref) ??
    funnel.audience.roles.find((r) => r.label.trim().toLowerCase() === ref.trim().toLowerCase());
  return role?.id;
}

export interface AppliedCases {
  cases: GeneratedCase[];
  /** Things in the file that did not resolve, reported rather than ignored. */
  problems: string[];
}

export function applyOverrides(funnel: Funnel, generated: GeneratedCase[], ov: Overrides): AppliedCases {
  const problems: string[] = [];
  let cases = generated;

  if (ov.only.length > 0) {
    cases = cases.filter((c) => ov.only.includes(c.plan.id));
    for (const id of ov.only) {
      if (!generated.some((c) => c.plan.id === id) && !ov.cases.some((c) => c.id === id)) {
        problems.push(`only: "${id}" is not a case this funnel generates`);
      }
    }
  }
  if (ov.skip.length > 0) {
    for (const id of ov.skip) {
      if (!generated.some((c) => c.plan.id === id)) problems.push(`skip: "${id}" is not a case this funnel generates`);
    }
    cases = cases.filter((c) => !ov.skip.includes(c.plan.id));
  }

  // Hand-written cases are appended, and may themselves be narrowed by `only`.
  for (const hand of ov.cases) {
    if (!hand.id) {
      problems.push("a hand-written case has no id");
      continue;
    }
    if (ov.only.length > 0 && !ov.only.includes(hand.id)) continue;
    const gateChoices: Record<string, string> = {};
    for (const [qRef, oRef] of Object.entries(hand.gate ?? {})) {
      const pair = resolveGatePick(funnel, qRef, oRef);
      if (!pair) {
        problems.push(`${hand.id}: gate answer "${qRef}" -> "${oRef}" does not resolve`);
        continue;
      }
      gateChoices[pair[0]] = pair[1];
    }
    const answers: Record<string, string> = {};
    for (const [qRef, oRef] of Object.entries(hand.answers ?? {})) {
      const pair = resolveAnswer(funnel, qRef, oRef);
      if (!pair) {
        problems.push(`${hand.id}: answer "${qRef}" -> "${oRef}" does not resolve`);
        continue;
      }
      answers[pair[0]] = pair[1];
    }
    const roleId = hand.audienceRole ? resolveRole(funnel, hand.audienceRole) : undefined;
    if (hand.audienceRole && !roleId) problems.push(`${hand.id}: audience role "${hand.audienceRole}" does not resolve`);

    const plan: CasePlan = {
      id: hand.id,
      kind: "edge",
      title: hand.title ?? "a case written by hand",
      audienceRoleId: roleId,
      audienceText: hand.audienceText,
      gateChoices,
      gateTexts: {},
      answers,
      behaviours: hand.behaviours ?? [],
    };
    cases.push({ plan });
  }

  return { cases, problems };
}

/** Pin an expectation to what the owner says it should be. */
export function overrideExpectation(expected: Expectation, o: ExpectOverride | undefined): Expectation {
  if (!o) return expected;
  const next: Expectation = {
    ...expected,
    gate: expected.gate ? { ...expected.gate } : null,
    rows: { ...expected.rows },
    score: expected.score ? { ...expected.score } : null,
    events: { fired: [...expected.events.fired], never: [...expected.events.never] },
  };
  if (next.gate) {
    if (o.exitKey !== undefined) {
      next.gate.exitKey = o.exitKey;
      next.gate.outcome = o.exitKey === null ? "pass" : "exit";
    }
    if (o.exitMode !== undefined) next.gate.exitMode = o.exitMode;
  }
  if (o.lead !== undefined) next.rows.lead = o.lead;
  if (o.submission !== undefined) next.rows.submission = o.submission;
  if (o.completed !== undefined) next.rows.completed = o.completed;
  if (o.gateEntry !== undefined) next.rows.gateEntry = o.gateEntry;
  if (o.disqualification !== undefined) next.rows.disqualification = o.disqualification;
  if (o.terminal !== undefined) next.terminal = o.terminal;
  if (next.score) {
    if (o.bandTitle !== undefined) next.score.bandTitle = o.bandTitle;
    if (o.percent !== undefined) next.score.percentage = o.percent;
  }
  if (o.events?.fires) next.events.fired = o.events.fires;
  if (o.events?.never) next.events.never = o.events.never;
  return next;
}

/* ---------- writing the first draft -------------------------------------------- */

export function writeOverridesTemplate(funnel: Funnel, generated: GeneratedCase[]): string {
  const path = overridesPath(funnel.row.slug);
  mkdirSync(join(QA_ROOT, "cases"), { recursive: true });
  const firstQuestion = funnel.qualification.questions[0];
  const firstOption = firstQuestion?.options[0];
  const lines = [
    `# ${funnel.row.title}`,
    "#",
    "# The harness generates its cases from this funnel, so there is usually nothing to",
    "# do here. Uncomment what you need:",
    "#   skip    case ids to leave out of the sweep",
    "#   only    run ONLY these ids",
    "#   expect  pin an expectation, so changing the funnel breaks the run instead of",
    "#           quietly changing what is expected",
    "#   cases   runs of answers you want driven every time (ids or the labels on screen)",
    "",
    `slug: ${funnel.row.slug}`,
    "",
    "# skip:",
    ...generated.map((c) => `#   - ${c.plan.id}   # ${c.plan.title}`),
    "",
    "# only: []",
    "",
    "# expect:",
    ...generated.slice(0, 3).map((c) => `#   ${c.plan.id}:\n#     completed: true`),
    "",
    "# cases:",
    "#   - id: the-one-i-worry-about",
    "#     title: what this run is meant to prove",
    ...(funnel.audienceActive && funnel.audience.roles[0] ? [`#     audienceRole: ${funnel.audience.roles[0].label}`] : []),
    ...(firstQuestion && firstOption
      ? ["#     gate:", `#       "${firstQuestion.text}": "${firstOption.label}"`]
      : []),
    "#     behaviours: [reload-mid-flow]",
    "#     expect:",
    "#       completed: true",
    "",
  ];
  writeFileSync(path, lines.join("\n"), "utf8");
  return path;
}
