/**
 * AD READINESS: is this funnel safe to put ad spend behind? One line per check, each a
 * pass or a fail with the reason in plain words, and `ready` true only when every
 * REQUIRED line passes. Advisory lines (required false) are worth fixing but never block.
 *
 * Pure on purpose: the action loads a snapshot and this decides, so the rules live in
 * one place the tests can read without a database.
 */

export interface ReadinessRange {
  minScore: number;
  maxScore: number;
}

export interface ReadinessInput {
  status: string;
  landing: { headline: string; subheadline: string; intro: string; startButtonLabel: string };
  gate: {
    active: boolean;
    /** Options that turn a person away (not the waitlist). */
    disqualifyOptions: number;
    waitlistOptions: number;
    /** Exit keys an answer points at that no exit carries. */
    danglingExitKeys: string[];
    /** Exits an answer routes to that have no heading or no body text. */
    exitsMissingCopy: string[];
  };
  categories: { name: string; questions: number; unscoredQuestions: string[] }[];
  resultBands: ReadinessRange[];
  resultPage: { bound: boolean; published: boolean };
  meta: {
    /** False when this funnel does not report to Meta at all. */
    usesMeta: boolean;
    /** Why publishing is refused for Meta reasons, or null when the account is complete. */
    accountProblem: string | null;
    hasTestEventCode: boolean;
  };
  runs: {
    capiAccepted: boolean;
    pixelReached: boolean;
    idsMatch: boolean;
    turnedAway: number;
    waitlisted: number;
    passedAndLeft: number;
    completed: number;
  };
}

export interface ReadinessLine {
  key: string;
  check: string;
  pass: boolean;
  required: boolean;
  detail: string;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Where the overall bands fail to cover 0 to 100 exactly once, or null when they do.
 *  Scores are whole numbers, so 0-40 then 41-59 is continuous. */
export function bandCoverageProblem(bands: ReadinessRange[]): string | null {
  if (bands.length === 0) return "No result bands yet.";
  const sorted = [...bands].sort((a, b) => a.minScore - b.minScore);
  const bad = sorted.find((b) => b.maxScore < b.minScore);
  if (bad) return `A band runs backwards (${fmt(bad.minScore)} to ${fmt(bad.maxScore)}).`;
  if (sorted[0]!.minScore > 0) return `Nothing covers 0 to ${fmt(sorted[0]!.minScore - 1)}.`;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.minScore <= prev.maxScore) return `Bands ${fmt(prev.minScore)}-${fmt(prev.maxScore)} and ${fmt(cur.minScore)}-${fmt(cur.maxScore)} overlap.`;
    if (cur.minScore - prev.maxScore > 1) return `Nothing covers ${fmt(prev.maxScore + 1)} to ${fmt(cur.minScore - 1)}.`;
  }
  const last = sorted[sorted.length - 1]!;
  if (last.maxScore < 100) return `Nothing covers ${fmt(last.maxScore + 1)} to 100.`;
  return null;
}

export function evaluateAdReadiness(x: ReadinessInput): { ready: boolean; lines: ReadinessLine[] } {
  const lines: ReadinessLine[] = [];
  const add = (key: string, check: string, pass: boolean, required: boolean, detail: string) =>
    lines.push({ key, check, pass, required, detail });

  // --- gate -------------------------------------------------------------------------
  add(
    "gate",
    "Gate questions",
    x.gate.active,
    false,
    x.gate.active
      ? `Gate on, with ${x.gate.disqualifyOptions} answer(s) that turn a person away and ${x.gate.waitlistOptions} that waitlist.`
      : "No gate: every visitor goes straight in. Fine for some funnels, but nobody is screened out before they reach you.",
  );
  if (x.gate.active) {
    add(
      "gate_exits",
      "Every turned-away answer has an exit",
      x.gate.danglingExitKeys.length === 0,
      true,
      x.gate.danglingExitKeys.length === 0
        ? "Every disqualifying answer points at an exit that exists."
        : `Answers point at exits that do not exist: ${x.gate.danglingExitKeys.join(", ")}.`,
    );
    add(
      "exit_copy",
      "Exit pages have a heading and text",
      x.gate.exitsMissingCopy.length === 0,
      true,
      x.gate.exitsMissingCopy.length === 0 ? "Every exit page says something." : `Missing a heading or text: ${x.gate.exitsMissingCopy.join(", ")}.`,
    );
  }

  // --- landing ----------------------------------------------------------------------
  const l = x.landing;
  const landingMissing = [
    !l.headline.trim() && "headline",
    !l.subheadline.trim() && !l.intro.trim() && "sub-line or intro",
  ].filter(Boolean) as string[];
  add(
    "landing",
    "Landing screen copy",
    landingMissing.length === 0,
    true,
    landingMissing.length === 0 ? `Headline: "${l.headline.trim()}".` : `Missing: ${landingMissing.join(", ")}.`,
  );
  add(
    "start_button",
    "Start button label",
    !!l.startButtonLabel.trim(),
    false,
    l.startButtonLabel.trim() ? `"${l.startButtonLabel.trim()}".` : "Uses the default label. Your own words convert better.",
  );

  // --- assessment -------------------------------------------------------------------
  const questions = x.categories.reduce((n, c) => n + c.questions, 0);
  const unscored = x.categories.flatMap((c) => c.unscoredQuestions);
  add(
    "questions",
    "Scored questions",
    questions > 0 && unscored.length === 0,
    true,
    questions === 0
      ? "The assessment has no questions yet."
      : unscored.length
        ? `Choice questions with fewer than two answers: ${unscored.slice(0, 5).join("; ")}.`
        : `${questions} question(s) in ${x.categories.length} categor${x.categories.length === 1 ? "y" : "ies"}.`,
  );
  const coverage = bandCoverageProblem(x.resultBands);
  add("bands", "Result bands cover 0 to 100", coverage === null, true, coverage ?? `${x.resultBands.length} bands, no gap, no overlap.`);

  // --- result page ------------------------------------------------------------------
  add(
    "result_page",
    "Result page published and bound",
    x.resultPage.bound && x.resultPage.published,
    true,
    !x.resultPage.bound
      ? "No result page is bound to this funnel."
      : x.resultPage.published
        ? "Bound and published."
        : "Bound, but never published: respondents see the default score cards.",
  );

  // --- Meta -------------------------------------------------------------------------
  if (!x.meta.usesMeta) {
    add("meta", "Pixel and Conversions API", true, true, "This funnel does not report to Meta.");
  } else {
    add("meta", "Pixel and Conversions API", x.meta.accountProblem === null, true, x.meta.accountProblem ?? "Pixel id and Conversions API token saved.");
    add(
      "test_code",
      "Test event code saved",
      x.meta.hasTestEventCode,
      true,
      x.meta.hasTestEventCode
        ? "Test runs send to Events Manager, Test events."
        : "No test event code: test runs cannot prove Meta accepts the events. Save one from Events Manager, Test events.",
    );
    add(
      "capi_accepted",
      "Meta accepted a server event",
      x.runs.capiAccepted,
      true,
      x.runs.capiAccepted ? "A test run's server event was accepted by Meta." : "No server event from a test run has been accepted yet.",
    );
    add(
      "pixel_path",
      "Browser pixel path reached",
      x.runs.pixelReached,
      true,
      x.runs.pixelReached ? "The page reached the pixel call (logged as would have fired in test runs)." : "No browser pixel event logged from a run yet.",
    );
    add(
      "dedup",
      "Browser and server share event ids",
      x.runs.idsMatch,
      true,
      x.runs.idsMatch ? "At least one event carries the same id from both sides, so Meta counts it once." : "No event id seen from both the browser and the server yet.",
    );
  }

  // --- publish ----------------------------------------------------------------------
  add("published", "Published", x.status === "PUBLISHED", true, x.status === "PUBLISHED" ? "Live." : "Still a draft: the public link shows nothing.");

  // --- test runs, one per path ------------------------------------------------------
  const r = x.runs;
  if (x.gate.active && x.gate.disqualifyOptions > 0) {
    add("run_turned_away", "Test run: turned away", r.turnedAway > 0, true, r.turnedAway > 0 ? `${r.turnedAway} test run(s).` : "Not tested yet.");
  }
  if (x.gate.active && x.gate.waitlistOptions > 0) {
    add("run_waitlisted", "Test run: waitlisted", r.waitlisted > 0, true, r.waitlisted > 0 ? `${r.waitlisted} test run(s).` : "Not tested yet.");
  }
  if (x.gate.active) {
    add(
      "run_abandoned",
      "Test run: passed the gate, then left",
      r.passedAndLeft > 0,
      true,
      r.passedAndLeft > 0 ? `${r.passedAndLeft} test run(s).` : "Not tested yet.",
    );
  }
  add("run_completed", "Test run: completed", r.completed > 0, true, r.completed > 0 ? `${r.completed} test run(s).` : "Not tested yet.");

  return { ready: lines.every((line) => line.pass || !line.required), lines };
}
