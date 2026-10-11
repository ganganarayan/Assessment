/**
 * Expected against observed, one statement at a time.
 *
 * Each check is a sentence somebody would say out loud about the funnel, so a failure
 * reads as a fact rather than a diff: "turned away at the gate" / expected exit1,
 * observed exit2. The harness is only useful if its output is the finding.
 *
 * Checks are skipped, never faked, when a case cannot reach them: a run that was
 * turned away has no band to compare, and pretending otherwise would bury the one
 * thing that did go wrong.
 */
import type { Expectation, CasePlan } from "../oracle/types.js";
import type { Observation } from "../drive/run.js";
import type { EventCounts, RowObservation } from "./db.js";
import type { Funnel } from "../config/read.js";

export type Verdict = "pass" | "fail" | "warn" | "skip";

export interface Check {
  verdict: Verdict;
  what: string;
  expected?: string;
  observed?: string;
}

const eq = (what: string, expected: unknown, observed: unknown): Check => ({
  verdict: String(expected) === String(observed) ? "pass" : "fail",
  what,
  expected: String(expected),
  observed: String(observed),
});

const ok = (what: string, condition: boolean, expected: string, observed: string): Check => ({
  verdict: condition ? "pass" : "fail",
  what,
  expected,
  observed,
});

export function compare(
  funnel: Funnel,
  plan: CasePlan,
  expected: Expectation,
  obs: Observation,
  rows: RowObservation,
  events: EventCounts,
  retakeObs?: Observation,
): Check[] {
  const checks: Check[] = [];
  const sawStep = (s: string) => obs.steps.includes(s);

  /* --- the screens -------------------------------------------------------------- */
  checks.push(eq("the run opens on the right screen", expected.firstStep, obs.steps[0] ?? "(nothing)"));

  if (expected.gate) {
    if (expected.gate.outcome === "exit") {
      checks.push(
        ok(
          "the gate routes them out",
          sawStep("disqualified") || expected.gate.takesAssessment || expected.gate.capturesLead,
          "the exit page",
          obs.steps.join(" -> "),
        ),
      );
      if (expected.gate.turnedAway) {
        checks.push(eq("out through the right exit", expected.gate.exitKey, obs.exitKey ?? "(none)"));
        if (expected.gate.exitHeading) {
          checks.push(eq("showing that exit's own heading", expected.gate.exitHeading, obs.exitHeading ?? "(none)"));
        }
        if (expected.gate.exitButtonLabel) {
          checks.push(eq("and that exit's own button", expected.gate.exitButtonLabel, obs.exitButtonLabel ?? "(none)"));
        }
        if (expected.gate.exitButtonUrl) {
          checks.push(eq("pointing where the owner sent them", expected.gate.exitButtonUrl, obs.exitButtonUrl ?? "(none)"));
        }
      }
    } else {
      checks.push(ok("the gate lets them through", !sawStep("disqualified"), "no exit page", obs.steps.join(" -> ")));
    }
  }

  if (expected.redirectToSlug) {
    checks.push(
      ok(
        "the audience role hands them to the other assessment",
        obs.finalUrl.includes(`/a/${expected.redirectToSlug}`),
        `/a/${expected.redirectToSlug}`,
        obs.finalUrl || "(nowhere)",
      ),
    );
  }

  /* --- the questions ------------------------------------------------------------ */
  if (expected.questionPath.length > 0 && !expected.abandonsAtOptin && !expected.blockedAtRequired) {
    const seen = obs.questionsSeen;
    checks.push(
      ok(
        "every question on the path is asked",
        expected.questionPath.every((q) => seen.includes(q)),
        `${expected.questionPath.length} question(s)`,
        `${seen.length} seen`,
      ),
    );
    if (funnel.routingActive) {
      checks.push(
        ok(
          "in the order the routing says",
          seen.join(",") === expected.questionPath.filter((q) => seen.includes(q)).join(","),
          expected.questionPath.join(","),
          seen.join(","),
        ),
      );
      const leaked = expected.skipped.filter((q) => seen.includes(q));
      checks.push(
        ok("and nothing it should have skipped", leaked.length === 0, "no skipped question shown", leaked.join(",") || "none"),
      );
    }
  }

  if (expected.blockedAtRequired) {
    checks.push(
      ok(
        "a required question stops the run",
        obs.blocked !== null,
        "a validation message",
        obs.blocked ?? "(it let them through)",
      ),
    );
  }

  /* --- the result --------------------------------------------------------------- */
  const reachedResult = obs.submissionId !== null || obs.band !== null;
  if (expected.score && expected.terminal && !expected.abandonsAtOptin && !expected.blockedAtRequired) {
    if (!reachedResult) {
      checks.push({
        verdict: expected.terminal === "DESTINATION" ? "skip" : "fail",
        what: "the respondent reaches their result",
        expected: `ends at ${expected.terminal}`,
        observed: obs.finalUrl || "(nowhere)",
      });
    } else {
      if (obs.percent !== null) {
        checks.push(eq("the percentage on the result page", expected.score.percentage, obs.percent));
      }
      if (obs.score !== null) checks.push(eq("the score on the result page", expected.score.total, obs.score));
      if (obs.max !== null) checks.push(eq("out of the achievable total", expected.score.max, obs.max));
      if (expected.score.bandTitle) {
        checks.push(eq("and the band it falls in", expected.score.bandTitle, obs.band ?? "(none)"));
      }
    }
  }

  /* --- what the funnel wrote ---------------------------------------------------- */
  checks.push(
    ok(
      expected.rows.submission ? "a submission row exists" : "NO submission row is created",
      expected.rows.submission === (rows.submissionId !== null),
      expected.rows.submission ? "one row" : "no row",
      rows.submissionId ? `row ${rows.submissionId}` : "no row",
    ),
  );
  if (expected.rows.submission) {
    checks.push(
      ok(
        expected.rows.lead ? "carrying their details" : "carrying no details",
        expected.rows.lead === rows.hasLead,
        expected.rows.lead ? "lead fields set" : "no lead fields",
        rows.hasLead ? `email ${rows.leadEmail ?? "(none)"}` : "no lead fields",
      ),
    );
    checks.push(
      ok(
        expected.rows.completed ? "and reaching COMPLETED" : "and NOT reaching COMPLETED",
        expected.rows.completed === (rows.status === "COMPLETED"),
        expected.rows.completed ? "COMPLETED" : "not COMPLETED",
        rows.status ?? "(no row)",
      ),
    );
  }

  if (expected.gate) {
    // The gate's own arithmetic, as stamped on the row: this is the copy anybody reads
    // later, so it is checked against the gate rather than against the browser.
    if (expected.gate.max > 0 && rows.submissionId) {
      checks.push(eq("the gate score on the row", expected.gate.score, rows.gateScore ?? "(null)"));
      checks.push(eq("the gate ceiling on the row", expected.gate.max, rows.gateMax ?? "(null)"));
      checks.push(eq("the gate band on the row", expected.gate.band ?? "(null)", rows.gateBand ?? "(null)"));
    }
    checks.push(
      ok(
        expected.rows.gateEntry ? "the pass is recorded against the visitor" : "no gate pass is recorded",
        expected.rows.gateEntry === rows.gateEntry,
        expected.rows.gateEntry ? "a GateEntry row" : "no GateEntry row",
        rows.gateEntry ? "a GateEntry row" : "no GateEntry row",
      ),
    );
    checks.push(
      ok(
        expected.rows.disqualification ? "the rejection is recorded" : "no rejection is recorded",
        expected.rows.disqualification === rows.disqualifications > 0,
        expected.rows.disqualification ? "at least one row" : "no rows",
        `${rows.disqualifications} row(s)`,
      ),
    );
    if (expected.rows.gateEntry) {
      checks.push(
        ok(
          expected.optinSeen
            ? "and the opt-in is marked as seen, which is what separates the two abandonment audiences"
            : "and the opt-in is not marked as seen",
          expected.optinSeen === (rows.optinSeenAt !== null),
          expected.optinSeen ? "optinSeenAt set" : "optinSeenAt null",
          rows.optinSeenAt ? rows.optinSeenAt.toISOString() : "null",
        ),
      );
    }
  }

  /* --- what Meta was told ------------------------------------------------------- */
  for (const name of expected.events.fired) {
    checks.push(
      ok(`${name} is reported`, (events.get(name) ?? 0) > 0, "at least one firing", `${events.get(name) ?? 0}`),
    );
  }
  for (const name of expected.events.never) {
    checks.push(
      ok(`${name} is NEVER reported`, (events.get(name) ?? 0) === 0, "no firing", `${events.get(name) ?? 0}`),
    );
  }

  /* --- nothing outbound on a test run ------------------------------------------- */
  if (rows.crmJobs > 0 || rows.nurtureLogs > 0 || rows.webhookDeliveries > 0) {
    checks.push({
      verdict: "warn",
      what: "the run sent something outbound",
      expected: "nothing queued",
      observed: `${rows.crmJobs} CRM job(s), ${rows.nurtureLogs} nurture log(s), ${rows.webhookDeliveries} webhook delivery/ies`,
    });
  }

  /* --- the awkward behaviours --------------------------------------------------- */
  if (plan.behaviours.includes("back-after-exit")) {
    const after = obs.steps.find((s) => s.startsWith("back:"));
    checks.push(
      ok(
        "pressing back does not get them into the funnel",
        after === "back:disqualified",
        "still the exit page",
        after?.replace("back:", "") ?? "(off the funnel)",
      ),
    );
  }

  if (expected.expectsRetakeLockout) {
    checks.push(
      retakeObs
        ? ok(
            "the same person is locked out on the second attempt",
            retakeObs.steps.includes("locked"),
            "the lockout screen",
            retakeObs.steps.join(" -> ") || "(nothing)",
          )
        : { verdict: "skip", what: "the same person is locked out on the second attempt", observed: "the second run was not driven" },
    );
  }

  if (obs.consoleErrors.length > 0) {
    checks.push({
      verdict: "warn",
      what: "the browser logged errors",
      observed: obs.consoleErrors.slice(0, 3).join(" | "),
    });
  }

  return checks;
}

export function worst(checks: Check[]): Verdict {
  if (checks.some((c) => c.verdict === "fail")) return "fail";
  if (checks.some((c) => c.verdict === "warn")) return "warn";
  if (checks.every((c) => c.verdict === "skip")) return "skip";
  return "pass";
}
