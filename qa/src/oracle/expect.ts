/**
 * What the funnel MUST do, given a plan.
 *
 * Every decision here is delegated to a module the app itself runs: firstStep and
 * afterGateStep for the opening screens, gateVerdict / gateTotals / gateBandOf for the
 * gate, buildSpine and walk for conditional routing, computeScores and pickResultBand
 * for the result, terminalStage for the ending, readMetaEvents for what is reported.
 *
 * Nothing is reimplemented. That is the whole design: when the owner changes a rule,
 * the expectation changes with it, and a case that then fails is a real regression
 * rather than a stale copy of last month's behaviour.
 */
import {
  firstStep,
  afterGateStep,
  gateIsLive,
} from "../../../src/features/assessment/flow/entry.js";
import { terminalStage } from "../../../src/features/assessment/flow/stages.js";
import { gateVerdict, gateTotals, gateBandOf } from "../../../src/features/assessment/gate-verdict.js";
import {
  resolveExit,
  exitTakesAssessment,
  exitCapturesLead,
  completionEventName,
  GATE_DISQUALIFIED_EVENT,
  GATE_PASSED_EVENT,
  UNNAMED_EXIT,
} from "../../../src/features/assessment/schemas.js";
import { readMetaEvents } from "../../../src/features/assessment/meta-events.js";
import { readPublishedPages } from "../../../src/features/assessment/pages/blocks.js";
import { computeScores, pickResultBand, type ScoringQuestion } from "../../../src/features/assessment/scoring.js";
import { buildSpine, walk, type RouteSpec } from "../../../src/lib/routing/engine.js";
import type { Funnel } from "../config/read.js";
import type { CasePlan, Expectation, ExpectedGate } from "./types.js";

/** The opt-in event Meta is told about, by its real name. */
const REGISTRATION_EVENT = "CompleteRegistration";

export function expectationFor(
  funnel: Funnel,
  plan: CasePlan,
  ctx: { capiAllowed: boolean; redirectSlugByAssessmentId: Map<string, string> },
): Expectation {
  const row = funnel.row;
  const entry = funnel.entry;
  const events = readMetaEvents(row.metaEvents);
  const eventOn = (key: keyof typeof events): boolean => row.fireMetaCapi && events[key] && ctx.capiAllowed;

  // --- the gate -------------------------------------------------------------------
  let gate: ExpectedGate | null = null;
  if (gateIsLive(entry)) {
    const verdict = gateVerdict(funnel.qualification, plan.gateChoices);
    const totals = gateTotals(funnel.qualification, plan.gateChoices);
    const exit = verdict.outcome === "exit" ? resolveExit(funnel.exits, verdict.exitKey) : null;
    gate = {
      outcome: verdict.outcome,
      exitKey: exit?.key ?? null,
      exitName: exit ? exit.name.trim() || UNNAMED_EXIT : null,
      exitMode: exit?.mode ?? null,
      exitHeading: exit ? exit.heading.trim() || null : null,
      // The exit page renders its button only when a URL is set - a label saved without
      // one is dropped, so expecting it would be expecting something the funnel has
      // never shown anybody. The default label is the app's own fallback.
      exitButtonUrl: exit ? exit.buttonUrl.trim() || null : null,
      exitButtonLabel: exit && exit.buttonUrl.trim() ? exit.buttonLabel.trim() || "Continue" : null,
      score: totals.score,
      max: totals.max,
      band: gateBandOf(funnel.qualification, totals.score, totals.max),
      // A PAGE exit is the only ending that takes nothing: no lead, no submission.
      turnedAway: verdict.outcome === "exit" && !exitCapturesLead(exit),
      capturesLead: verdict.outcome !== "exit" || exitCapturesLead(exit),
      takesAssessment: verdict.outcome !== "exit" || exitTakesAssessment(exit),
    };
  }

  // The awkward things a respondent does, which change what should EXIST rather than
  // what should be shown. Folded in here so one place answers "what rows and events
  // does this run owe", instead of each assertion guessing.
  const abandonsAtOptin = plan.behaviours.includes("abandon-at-optin");
  const blockedAtRequired = plan.behaviours.includes("skip-required");
  const expectsRetakeLockout = plan.behaviours.includes("retake");

  const turnedAway = gate?.turnedAway === true;
  // An OPTIN exit takes their details and stops at its own thank-you; a CONTINUE exit
  // carries on into the assessment like anybody who passed.
  const stopsAtThankYou = gate?.outcome === "exit" && gate.capturesLead && !gate.takesAssessment;

  // --- the questions --------------------------------------------------------------
  const spine = buildSpine(
    row.categories.map((c) => ({ id: c.id, page: c.page, questions: c.questions.map((q) => ({ id: q.id })) })),
  );
  const byOption = new Map<string, RouteSpec>();
  for (const c of row.categories) {
    for (const q of c.questions) {
      for (const o of q.options) {
        if (o.route) {
          byOption.set(o.id, {
            action: o.route.action,
            targetQuestionId: o.route.targetQuestionId,
            targetCategoryId: o.route.targetCategoryId,
          });
        }
      }
    }
  }
  const answersByQuestion = new Map(Object.entries(plan.answers));
  const reached = funnel.routingActive
    ? walk(answersByQuestion, spine, byOption).reached
    : spine.map((s) => s.id);
  const questionPath = turnedAway || stopsAtThankYou ? [] : reached;
  const skipped = spine.map((s) => s.id).filter((id) => !reached.includes(id));

  // --- the score ------------------------------------------------------------------
  const allQuestions = row.categories.flatMap((c) => c.questions.map((q) => ({ q, categoryId: c.id })));
  const optionById = new Map(allQuestions.flatMap(({ q }) => q.options.map((o) => [o.id, o] as const)));
  const reachedSet = new Set(questionPath);
  const scoringQuestions: ScoringQuestion[] = allQuestions
    .filter(({ q }) => reachedSet.has(q.id))
    .map(({ q, categoryId }) => ({
      id: q.id,
      categoryId,
      weight: q.weight,
      maxValue: q.options.reduce((m, o) => Math.max(m, o.value), 0),
    }));
  const answerValues = new Map<string, number>();
  for (const [qid, oid] of answersByQuestion) {
    if (!reachedSet.has(qid)) continue;
    const opt = optionById.get(oid);
    if (opt) answerValues.set(qid, opt.value);
  }

  const gateScore = gate && gate.max > 0 ? gate.score : 0;
  const gateMax = gate && gate.max > 0 ? gate.max : 0;
  const scored =
    turnedAway || stopsAtThankYou
      ? null
      : computeScores(
          scoringQuestions,
          answerValues,
          gateMax > 0 ? { score: gateScore, max: gateMax } : undefined,
        );
  // Bands are matched against the PERCENTAGE, exactly as the completion action does.
  const band = scored ? pickResultBand(row.resultBands, scored.percentage) : null;

  // --- the ending -----------------------------------------------------------------
  const terminal =
    turnedAway || stopsAtThankYou
      ? null
      : terminalStage({
          platformSignup: row.platformSignup,
          pageCount: readPublishedPages(row.publishedPages).length,
          paidMode: row.paidMode,
          vslCountdownSeconds: row.vslCountdownSeconds,
        });

  // --- what Meta is told ----------------------------------------------------------
  const fired: string[] = [];
  const never: string[] = [];

  if (gate) {
    if (gate.outcome === "exit") {
      // Per EXIT, never per funnel: a waitlist route reporting GateDisqualified would
      // poison the exclusion audience it shares with the real rejections.
      const exit = resolveExit(funnel.exits, gate.exitKey);
      if (eventOn("gateDisqualified") && exit?.fireDisqualifiedEvent) {
        fired.push(exit.eventName.trim() || GATE_DISQUALIFIED_EVENT);
      } else {
        never.push(GATE_DISQUALIFIED_EVENT);
      }
    } else if (eventOn("gatePassed")) {
      fired.push(GATE_PASSED_EVENT);
    } else {
      never.push(GATE_PASSED_EVENT);
    }
  }

  // Somebody who walked away from the opt-in, or who was stopped before reaching it,
  // produces no lead - so nothing that only a lead produces may be reported.
  const noOptin = abandonsAtOptin || (blockedAtRequired && row.leadCaptureAfter);

  if (turnedAway || noOptin) {
    // Nothing a lead would ever produce may appear for somebody who never opted in.
    never.push(REGISTRATION_EVENT, completionEventName(funnel.gateActive));
  } else {
    if (eventOn("registration")) fired.push(REGISTRATION_EVENT);
    else never.push(REGISTRATION_EVENT);
    if (!stopsAtThankYou && !blockedAtRequired && eventOn("completion")) {
      // A CONTINUE route's completion is reported under its OWN name, and a blank name
      // means silence: the ad account must not learn to find people who cannot buy.
      const exit = gate?.outcome === "exit" ? resolveExit(funnel.exits, gate.exitKey) : null;
      if (exit && exitTakesAssessment(exit)) {
        const named = exit.completionEventName.trim();
        if (named) fired.push(named);
        else never.push(completionEventName(funnel.gateActive));
      } else {
        fired.push(completionEventName(funnel.gateActive));
      }
    }
  }

  // --- what should exist in the database ------------------------------------------
  //
  // The row is created when the opt-in is SUBMITTED, not when it is reached: somebody
  // who walks away from the form leaves a GateEntry and nothing else, and that is the
  // difference the abandonment sweep reads. A required question stops the run where it
  // stands, which only costs the submission when the opt-in was still ahead of them.
  const opted = !turnedAway && !noOptin;
  const rows = {
    submission: opted,
    lead: opted,
    gateEntry: gate !== null && gate.outcome !== "exit",
    disqualification: gate?.outcome === "exit",
    completed: opted && !stopsAtThankYou && !blockedAtRequired,
  };

  const redirectToSlug = (() => {
    if (!plan.audienceRoleId) return null;
    const role = funnel.audience.roles.find((r) => r.id === plan.audienceRoleId);
    if (!role || !role.target) return null;
    return ctx.redirectSlugByAssessmentId.get(role.target) ?? null;
  })();

  return {
    firstStep: firstStep(entry),
    afterGate: afterGateStep(entry),
    gate,
    questionPath,
    skipped,
    terminal,
    redirectToSlug,
    score: scored
      ? {
          total: scored.totalScore,
          max: scored.maxScore,
          percentage: scored.percentage,
          gateScore,
          gateMax,
          bandId: band?.id ?? null,
          bandTitle: band?.title ?? null,
          bandLevel: band?.level ?? null,
        }
      : null,
    rows,
    events: { fired, never: never.filter((n) => !fired.includes(n)) },
    optinSeen: !turnedAway && !(blockedAtRequired && row.leadCaptureAfter),
    abandonsAtOptin,
    blockedAtRequired,
    expectsRetakeLockout,
  };
}
