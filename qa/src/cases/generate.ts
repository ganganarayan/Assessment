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
import { walk, nextIndex, type RouteSpec, type SpineQuestion } from "../../../src/lib/routing/engine.js";
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
  /** FREE_TEXT: a sentence, no options, scores nothing, routes by its default rule. */
  typed: boolean;
  options: { id: string; value: number }[];
}

function scoredQuestions(funnel: Funnel): ScoredQ[] {
  return funnel.row.categories.flatMap((c) =>
    c.questions.map((q) => ({
      id: q.id,
      categoryId: c.id,
      weight: q.weight,
      required: q.required,
      typed: q.type === "FREE_TEXT",
      options: q.options.map((o) => ({ id: o.id, value: o.value })),
    })),
  );
}

/** What the harness types into a FREE_TEXT question. Recognisable in the row later. */
const TYPED_ANSWER = "QA harness: a sentence typed where a sentence was asked for.";

/** Every typed question gets something, so a required one never blocks the run. */
function textsFor(qs: ScoredQ[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of qs) if (q.typed) out[q.id] = TYPED_ANSWER;
  return out;
}

// The spine and the option rules are built once, by the config reader, so the cases
// are generated against the same flow the oracle predicts and the respondent walks.
function routeMap(funnel: Funnel): Map<string, RouteSpec> {
  return funnel.byOption;
}

function spineOf(funnel: Funnel): SpineQuestion[] {
  return funnel.spine;
}

/** Answer every question with the option nearest `fraction` of its own best value.
 *  Typed questions have no options and are answered with text instead. */
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

/**
 * The harness knows this funnel shape exists and knows it cannot judge it.
 *
 * Its own class so the CLI can print it as a refusal rather than as a crash: a stack
 * trace reads as "the harness is broken", which is the wrong conclusion and sends
 * somebody debugging the wrong thing.
 */
export class UnsupportedFunnel extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFunnel";
  }
}

export function generateCases(funnel: Funnel, only: CaseKind[] = []): GeneratedCase[] {
  // 🔴 SPLIT lead capture is NOT covered yet, and this refuses rather than guesses.
  //
  // Every expectation in oracle/expect.ts is built on the single-screen model: one
  // opt-in, positioned by leadCaptureAfter, creating the submission when it is
  // submitted. A split funnel asks for the name before the gate, writes the lead at
  // the email screen, and does not create a submission until the phone screen - so
  // the derived cases would be confidently wrong about which screens appear, which
  // rows exist and which events fire.
  //
  // A harness that reports PASS against the wrong model is worse than one that says it
  // does not cover something: the first costs you an ad budget, the second costs you a
  // sentence. Covering split means teaching the oracle the second order, which is its
  // own piece of work.
  if (funnel.splitLeadCapture) {
    throw new UnsupportedFunnel(
      "This funnel uses SPLIT lead capture, which the case generator does not model yet.\n" +
        "Its expectations assume ONE opt-in screen positioned by leadCaptureAfter, so every\n" +
        "case derived here would be judged against the wrong flow: wrong screens, wrong rows,\n" +
        "wrong events - and it would report PASS.\n\n" +
        "Walk this funnel by hand for now. The lead appears under Gate qualified the moment\n" +
        "the email screen is submitted, and flips to Registered after the phone screen.",
    );
  }
  const wanted = (k: CaseKind) => only.length === 0 || only.includes(k);
  const out: GeneratedCase[] = [];
  const qs = gateQuestions(funnel);
  const texts = gateTextsFor(qs);
  const gateLive = gateIsLive(funnel.entry);
  const sq = scoredQuestions(funnel);
  const typedAnswers = textsFor(sq);
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
        texts: typedAnswers,
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
          texts: typedAnswers,
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
          texts: typedAnswers,
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
          texts: typedAnswers,
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
          texts: typedAnswers,
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
          texts: typedAnswers,
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
            plan: { id: w.id, kind: "gate", title: w.title, gateChoices: {}, gateTexts: texts, texts: typedAnswers, answers: baselineAnswers, behaviours: [] },
            unreachable: `no combination of non-disqualifying answers scores in ${w.min === Number.NEGATIVE_INFINITY ? `under ${w.max + 1}` : `${w.min} to ${w.max}`} (the gate can award ${gateTotals(funnel.qualification, lowestSafePicks(qs)).score} to ${ceiling})`,
          });
          continue;
        }
        out.push({
          plan: { id: w.id, kind: "gate", title: w.title, ...baselineAudience, gateChoices: picks, gateTexts: texts, texts: typedAnswers, answers: baselineAnswers, behaviours: [] },
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
          texts: typedAnswers,
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
          plan: { id: `route-${optionId}`, kind: "routes", title: `takes the route on one answer of question ${owner.id}`, gateChoices: baselineGate, gateTexts: texts, texts: typedAnswers, answers: {}, behaviours: [] },
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
          texts: typedAnswers,
          answers: reachPath,
          behaviours: [],
        },
      });
    }

    // The other half of branching: a question's DEFAULT route, which fires when no
    // option rule does - a skipped question, a typed one, or an answer with no rule of
    // its own. It is what brings a branch BACK, so a case that only ever triggers
    // option rules would never once prove that a branch rejoins where it should.
    for (const entry of spine) {
      const fallback = entry.defaultRoute;
      if (!fallback || fallback.action === "NEXT") continue;
      const owner = sq.find((q) => q.id === entry.id);
      if (!owner) continue;
      const reachPath = answersToReachQuestion(entry.id, spine, byOption, sq);
      if (!reachPath) {
        out.push({
          plan: {
            id: `default-route-${entry.id}`,
            kind: "routes",
            title: `reaches question ${entry.id} and leaves by its default route`,
            gateChoices: baselineGate,
            gateTexts: texts,
            texts: typedAnswers,
            answers: {},
            behaviours: [],
          },
          unreachable: "no run of answers reaches that question, so its default route can never fire",
        });
        continue;
      }
      // The question itself is left to its default: a typed answer for FREE_TEXT, and
      // nothing picked otherwise, which is exactly when the default is what decides.
      const partial = { ...reachPath };
      delete partial[entry.id];
      const answers = fillDownstream(partial, spine, byOption, sq);
      const after = walk(new Map(Object.entries(answers)), spine, byOption).reached;
      out.push({
        plan: {
          id: `default-route-${entry.id}`,
          kind: "routes",
          title: owner.typed
            ? `types an answer and the flow should rejoin by the default route, seeing ${after.length} question(s)`
            : `leaves that question to its default route, seeing ${after.length} question(s)`,
          ...baselineAudience,
          gateChoices: baselineGate,
          gateTexts: texts,
          texts: typedAnswers,
          answers,
          behaviours: [],
        },
      });
    }
  }

  /* --- the result bands --------------------------------------------------------- */
  if (wanted("bands") && funnel.row.resultBands.length > 0 && sq.length > 0) {
    // The gate's points count towards the result, so on a gate-heavy funnel the lowest
    // band is out of reach for a respondent who aced the gate. The search is therefore
    // allowed to vary the gate too - but only across answer sets that still get
    // THROUGH it, since an exit never reaches a result at all.
    const gateCandidates = (gateLive
      ? [safePicks(qs), lowestSafePicks(qs), gatePicksForScore(funnel, qs, funnel.qualification.bands.reviewMin, funnel.qualification.bands.passMin - 1)]
      : [{}]
    ).filter((picks): picks is Record<string, string> => {
      if (!picks) return false;
      if (!gateLive) return true;
      return gateVerdict(funnel.qualification, picks).outcome !== "exit";
    });

    for (const band of funnel.row.resultBands) {
      let found: Record<string, string> | null = null;
      let withGate = baselineGate;
      for (const gatePicks of gateCandidates) {
        found = answersForBand(funnel, sq, spine, byOption, gatePicks, band.minScore, band.maxScore);
        if (found) {
          withGate = gatePicks;
          break;
        }
      }
      if (!found) {
        out.push({
          plan: { id: `band-${band.id}`, kind: "bands", title: `lands in "${band.title}" (${band.minScore} to ${band.maxScore})`, gateChoices: baselineGate, gateTexts: texts, texts: typedAnswers, answers: {}, behaviours: [] },
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
          gateChoices: withGate,
          gateTexts: texts,
          texts: typedAnswers,
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
        texts: typedAnswers,
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
        texts: typedAnswers,
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
          texts: typedAnswers,
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
          texts: typedAnswers,
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
          texts: typedAnswers,
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
 * Answer everything still on the path, so the run can actually finish.
 *
 * Reaching a question is not the same as completing the assessment: whatever the flow
 * leads to AFTER it still has required questions, and leaving them empty means the
 * funnel refuses to submit - correctly - and the case fails for a reason that has
 * nothing to do with what it was testing.
 *
 * Options that carry a rule of their own are avoided where possible, so filling the
 * tail does not quietly re-route the very path the case was built to walk.
 */
function fillDownstream(
  answers: Record<string, string>,
  spine: SpineQuestion[],
  byOption: Map<string, RouteSpec>,
  sq: ScoredQ[],
): Record<string, string> {
  const out = { ...answers };
  for (let pass = 0; pass < spine.length + 1; pass++) {
    const reached = walk(new Map(Object.entries(out)), spine, byOption).reached;
    const next = reached.find((qid) => {
      const q = sq.find((x) => x.id === qid);
      return q && !q.typed && q.options.length > 0 && !out[qid];
    });
    if (!next) break;
    const q = sq.find((x) => x.id === next)!;
    const quiet = q.options.find((o) => !byOption.has(o.id)) ?? q.options[0]!;
    out[next] = quiet.id;
  }
  return out;
}

/**
 * Answers that simply REACH a question, without deciding what happens at it.
 *
 * Used for the default-route cases, where the point is what the flow does when no
 * option rule fires: the question is left unanswered (or, for a typed one, answered
 * with a sentence that carries no rule), and its own default route decides.
 */
function answersToReachQuestion(
  questionId: string,
  spine: SpineQuestion[],
  byOption: Map<string, RouteSpec>,
  sq: ScoredQ[],
): Record<string, string> | null {
  const owner = sq.find((q) => q.id === questionId);
  const firstOption = owner?.options[0]?.id;
  // A typed question has no option to pick, so reaching it is the whole request.
  const reached = firstOption
    ? answersToReach(questionId, firstOption, spine, byOption, sq)
    : answersToReachTyped(questionId, spine, byOption, sq);
  return reached;
}

/** Breadth-first to a question that cannot be "picked" at all (FREE_TEXT). */
function answersToReachTyped(
  questionId: string,
  spine: SpineQuestion[],
  byOption: Map<string, RouteSpec>,
  sq: ScoredQ[],
): Record<string, string> | null {
  const targetIndex = spine.findIndex((s) => s.id === questionId);
  if (targetIndex < 0) return null;
  const optionsOf = new Map(sq.map((q) => [q.id, q.options.map((o) => o.id)]));
  const queue: { index: number; answers: Record<string, string> }[] = [{ index: 0, answers: {} }];
  let guard = 0;
  while (queue.length > 0 && guard < 5000) {
    guard++;
    const st = queue.shift();
    if (!st) break;
    if (st.index === targetIndex) return { ...st.answers };
    const qid = spine[st.index]?.id;
    if (!qid) continue;
    const options = optionsOf.get(qid) ?? [];
    if (options.length === 0) {
      // Another typed question on the way: nothing to pick, so follow its default.
      const nxt = nextIndex(st.index, undefined, spine, byOption);
      if (nxt !== "END" && nxt <= targetIndex) queue.push({ index: nxt, answers: { ...st.answers } });
      continue;
    }
    for (const oid of options) {
      const nxt = nextIndex(st.index, oid, spine, byOption);
      if (nxt === "END" || nxt > targetIndex) continue;
      queue.push({ index: nxt, answers: { ...st.answers, [qid]: oid } });
    }
  }
  return null;
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
