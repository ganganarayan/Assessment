/**
 * Every condition the funnel can be in, derived from the funnel itself.
 *
 * This is the part that makes the sweep worth running: nobody writes the cases. The
 * funnel says it has four gate answers that turn people away, three exit routes, a
 * review band and nine scored questions with two jumps, and that statement is turned
 * into the list of runs that would prove it.
 *
 * Search, where it is needed, is deliberately small and honest: a band is found by
 * aiming at a target percentage and hill-climbing a few steps, and if no answer set
 * lands in a band the case is reported as UNREACHABLE rather than silently dropped -
 * a band nobody can land in is itself a finding about the funnel.
 */
import { gateIsLive } from "../../../src/features/assessment/flow/entry.js";
import { gateVerdict, gateTotals } from "../../../src/features/assessment/gate-verdict.js";
import { computeScores, pickResultBand, type ScoringQuestion } from "../../../src/features/assessment/scoring.js";
import { buildSpine, walk, nextIndex, type RouteSpec, type SpineQuestion } from "../../../src/lib/routing/engine.js";
import type { Funnel } from "../config/read.js";
import type { CasePlan, CaseKind } from "../oracle/types.js";

/** Which exit an option names, for the case title. Blank means the first exit, which
 *  is what a gate built before routes existed had. */
function exitKeyOf(funnel: Funnel, questionId: string, optionId: string): string {
  const q = funnel.qualification.questions.find((x) => x.id === questionId);
  const o = q?.options.find((x) => x.id === optionId);
  return o?.exitKey?.trim() || "(the first exit)";
}

/** What the harness types into a gate's manual-review text question. */
const TEXT_ANSWER = "QA harness";

export interface GeneratedCase {
  plan: CasePlan;
  /** Set when the case could not be built: reported, never silently skipped. */
  unreachable?: string;
}

/* ---------- gate helpers ------------------------------------------------------- */

interface GateOption {
  id: string;
  label: string;
  points: number;
  disqualifies: boolean;
}
interface GateQuestion {
  id: string;
  text: string;
  type: "choice" | "text";
  options: GateOption[];
}

function gateQuestions(funnel: Funnel): GateQuestion[] {
  return funnel.qualification.questions.map((q) => ({
    id: q.id,
    text: q.text,
    type: q.type,
    options: q.options.map((o) => ({ id: o.id, label: o.label, points: o.points, disqualifies: o.disqualifies })),
  }));
}

/** Gate texts for every manual-review question, so nothing blocks on a required field. */
function gateTextsFor(qs: GateQuestion[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of qs) if (q.type === "text") out[q.id] = TEXT_ANSWER;
  return out;
}

/** Picks that get through the gate: the highest-scoring option that does not disqualify. */
function safePicks(qs: GateQuestion[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of qs) {
    if (q.type !== "choice") continue;
    const safe = q.options.filter((o) => !o.disqualifies);
    const best = safe.reduce<GateOption | null>((m, o) => (!m || o.points > m.points ? o : m), null);
    if (best) out[q.id] = best.id;
  }
  return out;
}

/** Picks that score as LOW as the gate allows without hitting a disqualifying answer. */
function lowestSafePicks(qs: GateQuestion[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of qs) {
    if (q.type !== "choice") continue;
    const safe = q.options.filter((o) => !o.disqualifies);
    const worst = safe.reduce<GateOption | null>((m, o) => (!m || o.points < m.points ? o : m), null);
    if (worst) out[q.id] = worst.id;
  }
  return out;
}

/**
 * Gate picks whose total lands in [min, max], hill-climbed from the lowest safe set.
 * Returns null when no combination of safe answers can reach the window, which is a
 * fact about the gate worth printing.
 */
function gatePicksForScore(funnel: Funnel, qs: GateQuestion[], min: number, max: number): Record<string, string> | null {
  const picks = lowestSafePicks(qs);
  const score = () => gateTotals(funnel.qualification, picks).score;
  if (score() >= min && score() <= max) return { ...picks };

  // Raise one question at a time, smallest useful increase first, never overshooting.
  for (let step = 0; step < qs.length * 6; step++) {
    const need = min - score();
    if (need <= 0) break;
    let bestQ: string | null = null;
    let bestOpt: string | null = null;
    let bestGain = 0;
    for (const q of qs) {
      if (q.type !== "choice") continue;
      const current = q.options.find((o) => o.id === picks[q.id]);
      if (!current) continue;
      for (const o of q.options) {
        if (o.disqualifies) continue;
        const gain = o.points - current.points;
        if (gain <= 0) continue;
        const after = score() + gain;
        if (after > max) continue;
        if (gain > bestGain) {
          bestGain = gain;
          bestQ = q.id;
          bestOpt = o.id;
        }
      }
    }
    if (!bestQ || !bestOpt) break;
    picks[bestQ] = bestOpt;
  }
  const final = score();
  return final >= min && final <= max ? { ...picks } : null;
}

/* ---------- scored-question helpers -------------------------------------------- */

interface ScoredQ {
  id: string;
  categoryId: string;
  weight: number;
  required: boolean;
  options: { id: string; value: number }[];
}

function scoredQuestions(funnel: Funnel): ScoredQ[] {
  return funnel.row.categories.flatMap((c) =>
    c.questions.map((q) => ({
      id: q.id,
      categoryId: c.id,
      weight: q.weight,
      required: q.required,
      options: q.options.map((o) => ({ id: o.id, value: o.value })),
    })),
  );
}

function routeMap(funnel: Funnel): Map<string, RouteSpec> {
  const m = new Map<string, RouteSpec>();
  for (const c of funnel.row.categories) {
    for (const q of c.questions) {
      for (const o of q.options) {
        if (o.route) {
          m.set(o.id, {
            action: o.route.action,
            targetQuestionId: o.route.targetQuestionId,
            targetCategoryId: o.route.targetCategoryId,
          });
        }
      }
    }
  }
  return m;
}

function spineOf(funnel: Funnel): SpineQuestion[] {
  return buildSpine(
    funnel.row.categories.map((c) => ({ id: c.id, page: c.page, questions: c.questions.map((q) => ({ id: q.id })) })),
  );
}

/** Answer every question with the option nearest `fraction` of its own best value. */
function answersAtFraction(qs: ScoredQ[], fraction: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of qs) {
    if (q.options.length === 0) continue;
    const best = q.options.reduce((m, o) => Math.max(m, o.value), 0);
    const target = best * fraction;
    const pick = q.options.reduce((m, o) =>
      Math.abs(o.value - target) < Math.abs(m.value - target) ? o : m,
    );
    out[q.id] = pick.id;
  }
  return out;
}

/* ---------- the generator ------------------------------------------------------ */

export function generateCases(funnel: Funnel, only: CaseKind[] = []): GeneratedCase[] {
  const wanted = (k: CaseKind) => only.length === 0 || only.includes(k);
  const out: GeneratedCase[] = [];
  const qs = gateQuestions(funnel);
  const texts = gateTextsFor(qs);
  const gateLive = gateIsLive(funnel.entry);
  const sq = scoredQuestions(funnel);
  const spine = spineOf(funnel);
  const byOption = routeMap(funnel);

  // A respondent who answers everything middling: the baseline the other cases vary.
  const baselineAnswers = answersAtFraction(sq, 0.6);
  const baselineGate = safePicks(qs);
  // Every case that is not ABOUT the audience still has to get past it, and it has to
  // stay in this funnel while doing so - a role that hands them to another assessment
  // would quietly turn every other case into a test of that one.
  const stayingRole = funnel.audienceActive && funnel.audience.mode === "DROPDOWN"
    ? (funnel.audience.roles.find((r) => !r.target) ?? funnel.audience.roles[0])
    : undefined;
  const baselineAudience: Pick<CasePlan, "audienceRoleId" | "audienceText"> = funnel.audienceActive
    ? funnel.audience.mode === "DROPDOWN"
      ? { audienceRoleId: stayingRole?.id }
      : { audienceText: funnel.audience.roles[0]?.label || "Founder" }
    : {};

  /* --- the way through ---------------------------------------------------------- */
  if (wanted("entry")) {
    out.push({
      plan: {
        id: "clean-run",
        kind: "entry",
        title: "answers everything and gets through to the end",
        ...baselineAudience,
        ...baselineAudience,
        gateChoices: baselineGate,
        gateTexts: texts,
        answers: baselineAnswers,
        behaviours: [],
      },
    });
  }

  /* --- the audience gate -------------------------------------------------------- */
  if (wanted("audience") && funnel.audienceActive) {
    if (funnel.audience.mode === "DROPDOWN") {
      for (const role of funnel.audience.roles) {
        out.push({
          plan: {
            id: `audience-${role.id}`,
            kind: "audience",
            title: `picks "${role.label}"${role.target ? " and should be handed to another assessment" : " and continues here"}`,
            audienceRoleId: role.id,
            gateChoices: baselineGate,
            gateTexts: texts,
            answers: baselineAnswers,
            behaviours: [],
          },
        });
      }
    } else {
      const suggestion = funnel.audience.roles[0]?.label ?? "";
      out.push({
        plan: {
          id: "audience-typed-known",
          kind: "audience",
          title: suggestion ? `types the known role "${suggestion}"` : "types a role",
          audienceText: suggestion || "Founder",
          gateChoices: baselineGate,
          gateTexts: texts,
          answers: baselineAnswers,
          behaviours: [],
        },
      });
      out.push({
        plan: {
          id: "audience-typed-unknown",
          kind: "audience",
          title: "types something that is not on the list, which must still be accepted",
          audienceText: "Kite repairer",
          gateChoices: baselineGate,
          gateTexts: texts,
          answers: baselineAnswers,
          behaviours: [],
        },
      });
      if (!funnel.audience.freeTextRequired) {
        out.push({
          plan: {
            id: "audience-left-blank",
            kind: "audience",
            title: "leaves the optional audience field blank and continues",
            audienceText: "",
            gateChoices: baselineGate,
            gateTexts: texts,
            answers: baselineAnswers,
            behaviours: [],
          },
        });
      }
    }
  }

  /* --- the qualification gate --------------------------------------------------- */
  if (wanted("gate") && gateLive) {
    // One case per disqualifying answer: each is a different door out.
    for (const q of qs) {
      for (const o of q.options) {
        if (!o.disqualifies) continue;
        const choices = { ...safePicks(qs), [q.id]: o.id };
        out.push({
          plan: {
            id: `gate-dq-${q.id}-${o.id}`,
            kind: "gate",
            title: `answers "${o.label}" and should leave by exit "${exitKeyOf(funnel, q.id, o.id)}"`,
            ...baselineAudience,
            gateChoices: choices,
            gateTexts: texts,
            answers: baselineAnswers,
            behaviours: [],
          },
        });
      }
    }

    const bands = funnel.qualification.bands;
    if (bands.enabled) {
      const ceiling = gateTotals(funnel.qualification, safePicks(qs)).score;
      const windows: { id: string; title: string; min: number; max: number }[] = [
        { id: "gate-band-pass", title: `scores ${bands.passMin} or more and goes through clean`, min: bands.passMin, max: Math.max(bands.passMin, ceiling) },
        { id: "gate-band-review", title: `scores between ${bands.reviewMin} and ${bands.passMin - 1} and is flagged for review`, min: bands.reviewMin, max: bands.passMin - 1 },
        { id: "gate-band-below", title: `scores under ${bands.reviewMin} and should be routed out`, min: Number.NEGATIVE_INFINITY, max: bands.reviewMin - 1 },
      ];
      for (const w of windows) {
        const picks =
          w.id === "gate-band-below"
            ? (() => {
                const low = lowestSafePicks(qs);
                return gateTotals(funnel.qualification, low).score <= w.max ? low : null;
              })()
            : gatePicksForScore(funnel, qs, w.min, w.max);
        if (!picks) {
          out.push({
            plan: { id: w.id, kind: "gate", title: w.title, gateChoices: {}, gateTexts: texts, answers: baselineAnswers, behaviours: [] },
            unreachable: `no combination of non-disqualifying answers scores in ${w.min === Number.NEGATIVE_INFINITY ? `under ${w.max + 1}` : `${w.min} to ${w.max}`} (the gate can award ${gateTotals(funnel.qualification, lowestSafePicks(qs)).score} to ${ceiling})`,
          });
          continue;
        }
        out.push({
          plan: { id: w.id, kind: "gate", title: w.title, ...baselineAudience, gateChoices: picks, gateTexts: texts, answers: baselineAnswers, behaviours: [] },
        });
      }
    } else {
      out.push({
        plan: {
          id: "gate-clean-pass",
          kind: "gate",
          title: "dodges every disqualifying answer and is let through",
          ...baselineAudience,
          gateChoices: safePicks(qs),
          gateTexts: texts,
          answers: baselineAnswers,
          behaviours: [],
        },
      });
    }
  }

  /* --- conditional routing ------------------------------------------------------ */
  if (wanted("routes") && funnel.routingActive) {
    for (const [optionId, route] of byOption) {
      if (route.action === "NEXT") continue;
      const owner = sq.find((q) => q.options.some((o) => o.id === optionId));
      if (!owner) continue;
      const reachPath = answersToReach(owner.id, optionId, spine, byOption, sq);
      if (!reachPath) {
        out.push({
          plan: { id: `route-${optionId}`, kind: "routes", title: `takes the route on one answer of question ${owner.id}`, gateChoices: baselineGate, gateTexts: texts, answers: {}, behaviours: [] },
          unreachable: "no run of answers reaches that question, so its route can never fire",
        });
        continue;
      }
      const after = walk(new Map(Object.entries(reachPath)), spine, byOption).reached;
      out.push({
        plan: {
          id: `route-${optionId}`,
          kind: "routes",
          title: `answers to trigger the ${route.action.toLowerCase().replace(/_/g, " ")} route and should see ${after.length} question(s)`,
          ...baselineAudience,
          gateChoices: baselineGate,
          gateTexts: texts,
          answers: reachPath,
          behaviours: [],
        },
      });
    }
  }

  /* --- the result bands --------------------------------------------------------- */
  if (wanted("bands") && funnel.row.resultBands.length > 0 && sq.length > 0) {
    for (const band of funnel.row.resultBands) {
      const found = answersForBand(funnel, sq, spine, byOption, baselineGate, band.minScore, band.maxScore);
      if (!found) {
        out.push({
          plan: { id: `band-${band.id}`, kind: "bands", title: `lands in "${band.title}" (${band.minScore} to ${band.maxScore})`, gateChoices: baselineGate, gateTexts: texts, answers: {}, behaviours: [] },
          unreachable: "no answer set lands in this band, so nobody can ever see it",
        });
        continue;
      }
      out.push({
        plan: {
          id: `band-${band.id}`,
          kind: "bands",
          title: `lands in "${band.title}" (${band.minScore} to ${band.maxScore})`,
          ...baselineAudience,
          gateChoices: baselineGate,
          gateTexts: texts,
          answers: found,
          behaviours: [],
        },
      });
    }
  }

  /* --- the awkward things people do --------------------------------------------- */
  if (wanted("edge")) {
    out.push({
      plan: {
        id: "edge-reload-mid-flow",
        kind: "edge",
        title: "reloads the page part way through and carries on",
        ...baselineAudience,
        gateChoices: baselineGate,
        gateTexts: texts,
        answers: baselineAnswers,
        behaviours: ["reload-mid-flow"],
      },
    });
    out.push({
      plan: {
        id: "edge-abandon-at-optin",
        kind: "edge",
        title: "reaches the opt-in and walks away, leaving no lead",
        ...baselineAudience,
        gateChoices: baselineGate,
        gateTexts: texts,
        answers: baselineAnswers,
        behaviours: ["abandon-at-optin"],
      },
    });
    if (sq.some((q) => q.required)) {
      out.push({
        plan: {
          id: "edge-skip-required",
          kind: "edge",
          title: "tries to continue with a required question unanswered and must be stopped",
          gateChoices: baselineGate,
          gateTexts: texts,
          answers: baselineAnswers,
          behaviours: ["skip-required"],
        },
      });
    }
    if (funnel.row.retakePolicy !== "UNLIMITED") {
      out.push({
        plan: {
          id: "edge-retake",
          kind: "edge",
          title: `finishes, comes back as the same person, and should hit the ${funnel.row.retakePolicy} lockout`,
          gateChoices: baselineGate,
          gateTexts: texts,
          answers: baselineAnswers,
          behaviours: ["retake"],
        },
      });
    }
    const firstExit = funnel.exits[0];
    if (gateLive && firstExit) {
      const dq = qs.flatMap((q) => q.options.filter((o) => o.disqualifies).map((o) => ({ q, o })))[0];
      if (dq) {
        out.push({
          plan: {
            id: "edge-back-after-exit",
            kind: "edge",
            title: "is turned away, comes back to the funnel, and must still be out",
            ...baselineAudience,
            gateChoices: { ...safePicks(qs), [dq.q.id]: dq.o.id },
            gateTexts: texts,
            answers: baselineAnswers,
            behaviours: ["back-after-exit"],
          },
        });
      }
    }
  }

  return out;
}

/**
 * Answers that reach `questionId` and pick `optionId` there.
 *
 * Breadth-first over the option graph, because a question can sit behind a jump that
 * only one upstream answer takes: trying the linear path first and giving up would
 * report a perfectly good route as unreachable.
 */
function answersToReach(
  questionId: string,
  optionId: string,
  spine: SpineQuestion[],
  byOption: Map<string, RouteSpec>,
  sq: ScoredQ[],
): Record<string, string> | null {
  const targetIndex = spine.findIndex((s) => s.id === questionId);
  if (targetIndex < 0) return null;
  const optionsOf = new Map(sq.map((q) => [q.id, q.options.map((o) => o.id)]));

  interface State {
    index: number;
    answers: Record<string, string>;
  }
  const queue: State[] = [{ index: 0, answers: {} }];
  let guard = 0;
  while (queue.length > 0 && guard < 5000) {
    guard++;
    const st = queue.shift();
    if (!st) break;
    if (st.index === targetIndex) {
      const answers = { ...st.answers, [questionId]: optionId };
      // Fill in everything downstream of the chosen route with a first option, so the
      // run can actually finish.
      let i = nextIndex(targetIndex, optionId, spine, byOption);
      let steps = 0;
      while (i !== "END" && steps++ < spine.length) {
        const qid = spine[i]?.id;
        if (!qid) break;
        const first = optionsOf.get(qid)?.[0];
        if (first) answers[qid] = first;
        i = nextIndex(i, first, spine, byOption);
      }
      return answers;
    }
    const qid = spine[st.index]?.id;
    if (!qid) continue;
    for (const oid of optionsOf.get(qid) ?? []) {
      const nxt = nextIndex(st.index, oid, spine, byOption);
      if (nxt === "END" || nxt > targetIndex) continue;
      queue.push({ index: nxt, answers: { ...st.answers, [qid]: oid } });
    }
  }
  return null;
}

/**
 * An answer set whose PERCENTAGE lands in a band.
 *
 * Aims at the middle of the band as a fraction of the achievable total, then climbs
 * one question at a time. Deliberately shallow: the point is to find one respondent
 * per band, not the optimal one.
 */
function answersForBand(
  funnel: Funnel,
  sq: ScoredQ[],
  spine: SpineQuestion[],
  byOption: Map<string, RouteSpec>,
  gateChoices: Record<string, string>,
  min: number,
  max: number,
): Record<string, string> | null {
  const gate = gateTotals(funnel.qualification, gateChoices);
  const extra = gate.max > 0 ? { score: gate.score, max: gate.max } : undefined;

  const evaluate = (answers: Record<string, string>): number => {
    const reached = funnel.routingActive
      ? new Set(walk(new Map(Object.entries(answers)), spine, byOption).reached)
      : new Set(spine.map((s) => s.id));
    const questions: ScoringQuestion[] = sq
      .filter((q) => reached.has(q.id))
      .map((q) => ({ id: q.id, categoryId: q.categoryId, weight: q.weight, maxValue: q.options.reduce((m, o) => Math.max(m, o.value), 0) }));
    const values = new Map<string, number>();
    for (const q of sq) {
      if (!reached.has(q.id)) continue;
      const picked = q.options.find((o) => o.id === answers[q.id]);
      if (picked) values.set(q.id, picked.value);
    }
    return computeScores(questions, values, extra).percentage;
  };

  const target = (min + max) / 2;
  let best: { answers: Record<string, string>; pct: number } | null = null;
  for (const seed of [target / 100, min / 100, max / 100, 0.5, 0, 1]) {
    const answers = answersAtFraction(sq, Math.max(0, Math.min(1, seed)));
    const pct = evaluate(answers);
    if (pct >= min && pct <= max) return answers;
    if (!best || Math.abs(pct - target) < Math.abs(best.pct - target)) best = { answers, pct };
  }
  if (!best) return null;

  // Climb: move one question at a time towards the window.
  const answers = { ...best.answers };
  for (let step = 0; step < sq.length * 4; step++) {
    const pct = evaluate(answers);
    if (pct >= min && pct <= max) return answers;
    const up = pct < min;
    let moved = false;
    for (const q of sq) {
      const current = q.options.find((o) => o.id === answers[q.id]);
      if (!current) continue;
      const candidates = q.options
        .filter((o) => (up ? o.value > current.value : o.value < current.value))
        .sort((a, b) => (up ? a.value - b.value : b.value - a.value));
      const candidate = candidates[0];
      if (!candidate) continue;
      const trial = { ...answers, [q.id]: candidate.id };
      const trialPct = evaluate(trial);
      if (Math.abs(trialPct - target) < Math.abs(pct - target)) {
        answers[q.id] = candidate.id;
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }
  const finalPct = evaluate(answers);
  // A band the funnel can produce a result for, but whose range nothing lands in, is a
  // finding about the bands rather than about the harness.
  return finalPct >= min && finalPct <= max ? answers : null;
}
