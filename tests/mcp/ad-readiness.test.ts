import "./env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { bandCoverageProblem, evaluateAdReadiness, type ReadinessInput } from "@/features/onboarding/ad-readiness";
import { adLinkFor, META_URL_PARAMETERS } from "@/lib/meta/url-parameters";
import { ACTION_CATALOG } from "@/mcp/actions/catalog.generated";

const ready: ReadinessInput = {
  status: "PUBLISHED",
  landing: { headline: "Is your clinic ready to grow?", subheadline: "Three minutes.", intro: "", startButtonLabel: "Start" },
  gate: { active: true, disqualifyOptions: 2, waitlistOptions: 1, danglingExitKeys: [], exitsMissingCopy: [] },
  categories: [{ name: "Demand", questions: 4, unscoredQuestions: [] }],
  resultBands: [
    { minScore: 0, maxScore: 40 },
    { minScore: 41, maxScore: 59 },
    { minScore: 60, maxScore: 75 },
    { minScore: 76, maxScore: 100 },
  ],
  resultPage: { bound: true, published: true },
  meta: { usesMeta: true, accountProblem: null, hasTestEventCode: true },
  runs: { capiAccepted: true, pixelReached: true, idsMatch: true, turnedAway: 1, waitlisted: 1, passedAndLeft: 1, completed: 1 },
};

test("bands: the four built-in bands cover 0 to 100", () => {
  assert.equal(bandCoverageProblem(ready.resultBands), null);
});

test("bands: gaps, overlaps and short ends are named", () => {
  assert.match(bandCoverageProblem([{ minScore: 0, maxScore: 40 }, { minScore: 45, maxScore: 100 }])!, /41 to 44/);
  assert.match(bandCoverageProblem([{ minScore: 0, maxScore: 50 }, { minScore: 50, maxScore: 100 }])!, /overlap/);
  assert.match(bandCoverageProblem([{ minScore: 5, maxScore: 100 }])!, /0 to 4/);
  assert.match(bandCoverageProblem([{ minScore: 0, maxScore: 90 }])!, /91 to 100/);
  assert.ok(bandCoverageProblem([]));
});

test("readiness: a complete, tested funnel is ready", () => {
  const r = evaluateAdReadiness(ready);
  assert.equal(r.ready, true, r.lines.filter((l) => !l.pass).map((l) => l.key).join(","));
});

test("readiness: each missing test path blocks", () => {
  for (const k of ["turnedAway", "waitlisted", "passedAndLeft", "completed"] as const) {
    const r = evaluateAdReadiness({ ...ready, runs: { ...ready.runs, [k]: 0 } });
    assert.equal(r.ready, false, `${k} = 0 must block`);
  }
});

test("readiness: no waitlist answer means no waitlist run is asked for", () => {
  const r = evaluateAdReadiness({ ...ready, gate: { ...ready.gate, waitlistOptions: 0 }, runs: { ...ready.runs, waitlisted: 0 } });
  assert.equal(r.ready, true);
});

test("readiness: Meta proof blocks only when the funnel uses Meta", () => {
  const noProof = { ...ready.runs, capiAccepted: false, pixelReached: false, idsMatch: false };
  assert.equal(evaluateAdReadiness({ ...ready, runs: noProof }).ready, false);
  assert.equal(evaluateAdReadiness({ ...ready, runs: noProof, meta: { usesMeta: false, accountProblem: null, hasTestEventCode: false } }).ready, true);
});

test("readiness: advisory lines never block", () => {
  const r = evaluateAdReadiness({ ...ready, landing: { ...ready.landing, startButtonLabel: "" } });
  assert.equal(r.ready, true);
  assert.equal(r.lines.find((l) => l.key === "start_button")?.pass, false);
});

test("ad link: website URL plus the exact URL parameters", () => {
  const l = adLinkFor("https://clinic.example.com/", "grow");
  assert.equal(l.website_url, "https://clinic.example.com/a/grow");
  assert.equal(l.url_parameters, META_URL_PARAMETERS);
  assert.equal(l.full_url, `https://clinic.example.com/a/grow?${META_URL_PARAMETERS}`);
});

test("adReadiness is a read action Claude can call", () => {
  const e = ACTION_CATALOG.find((x) => x.id === "onboarding.adReadiness");
  assert.equal(e?.kind, "read");
  assert.ok(e?.doc);
});
