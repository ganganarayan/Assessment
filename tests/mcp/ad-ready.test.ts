import "./env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { adParamInput } from "@/mcp/tools/shared";
import { ACTION_CATALOG } from "@/mcp/actions/catalog.generated";
import { AD_READY_PROMPT, META_URL_PARAMETERS } from "@/mcp/core/playbook";

test("the Meta URL parameters put the ad id where stats read it by default", () => {
  const field = adParamInput.parse(undefined);
  assert.ok(META_URL_PARAMETERS.includes(`${field}={{ad.id}}`), `${field} must carry {{ad.id}}`);
  assert.ok(META_URL_PARAMETERS.includes("utm_term={{adset.id}}"));
});

test("every action the ad-ready playbook names exists and has a description", () => {
  const named = [...AD_READY_PROMPT.text.matchAll(/\b((?:assessment|templates|onboarding|admin|events|result-pages)\.[\w.-]+\.[a-zA-Z]+)/g)].map((m) => m[1]!);
  assert.ok(named.length >= 10, "the playbook names its actions");
  for (const id of new Set(named)) {
    const e = ACTION_CATALOG.find((x) => x.id === id);
    assert.ok(e, `${id} is in the action catalog`);
    assert.ok(e.doc, `${id} has a description`);
  }
});

test("long action inputs are listed field by field", () => {
  const e = ACTION_CATALOG.find((x) => x.id === "assessment.assessment.updateAssessment");
  const fields = e?.params[1]?.fields ?? [];
  for (const f of ["title", "slug", "retakePolicy", "adAccountId"]) assert.ok(fields.some((x) => x.name === f), `updateAssessment lists ${f}`);
});

test("the landing screen has its own read and patch", () => {
  const read = ACTION_CATALOG.find((x) => x.id === "assessment.landing.getLandingScreen");
  const save = ACTION_CATALOG.find((x) => x.id === "assessment.landing.saveLandingScreen");
  assert.equal(read?.kind, "read");
  assert.equal(save?.kind, "write");
  assert.ok(save?.params[1]?.fields?.some((f) => f.name === "headline"));
});

test("the run event log and the test event code setter are reachable", () => {
  const log = ACTION_CATALOG.find((x) => x.id === "events.log.listRunEvents");
  const code = ACTION_CATALOG.find((x) => x.id === "admin.ad-account.saveTestEventCode");
  assert.equal(log?.kind, "read");
  assert.deepEqual(log?.params.map((p) => p.name), ["assessmentId", "sinceMinutes", "includeTestRuns"]);
  assert.equal(code?.kind, "write");
});
