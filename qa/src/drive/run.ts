/**
 * The browser half: press the buttons, write down what happened.
 *
 * It is deliberately stupid about meaning. It reads the screen it is on from
 * data-qa-step, does the one thing that screen needs from the plan, and records what it
 * saw. Nothing in here knows which exit SHOULD appear or what the band OUGHT to be -
 * that is the oracle's job, and keeping the two apart is what stops a harness from
 * agreeing with itself.
 *
 * The user agent is overridden to a plain Chrome string on purpose: src/lib/bots.ts
 * treats anything containing "playwright" or "headless" as a bot, and a bot-flagged run
 * is excluded from the funnel's own numbers - so the harness would be testing a path
 * real traffic never takes.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { CasePlan } from "../oracle/types.js";
import type { Funnel } from "../config/read.js";
import { identityFor, type Identity } from "./identity.js";

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Screens that end a run: nothing further is pressed. */
const TERMINAL_STEPS = new Set(["disqualified", "locked", "capLocked", "resultPages"]);

export interface Observation {
  /** data-qa-step values in the order they appeared. */
  steps: string[];
  /** The exit page's key, when one was reached. */
  exitKey: string | null;
  /** Visible heading of the exit page, and its button, as the respondent saw them. */
  exitHeading: string | null;
  exitButtonLabel: string | null;
  exitButtonUrl: string | null;
  /** Scored question ids in the order they were shown. */
  questionsSeen: string[];
  /** Gate question ids in the order they were asked. */
  gateQuestionsSeen: string[];
  /** A validation message the funnel showed instead of advancing. */
  blocked: string | null;
  finalUrl: string;
  band: string | null;
  percent: number | null;
  score: number | null;
  max: number | null;
  /** Submission id, read off the result URL. */
  submissionId: string | null;
  /**
   * The server-set visitor cookie (a360_vid). GateDisqualification rows are keyed on
   * this one, because a rejected visitor never runs the client code that would make
   * the other id.
   */
  visitorId: string | null;
  /**
   * The browser's own first-party id (localStorage a360_xid). GateEntry and the CAPI
   * external_id are keyed on THIS one. Two ids, two tables - mixing them up reads as
   * "the funnel never recorded the pass", which is how this field came to exist.
   */
  externalId: string | null;
  /** Browser-side Meta pixel calls, by event name. Empty when no pixel is configured. */
  pixelEvents: string[];
  consoleErrors: string[];
  /** The app's own error boundary rendered: the funnel fell over, which is a different
   *  statement from the funnel behaving wrongly, and is usually transient. */
  crashed: boolean;
  /** Everything the driver did, for the report when something goes wrong. */
  trail: string[];
  screenshot?: Buffer;
}

export interface DriveOptions {
  baseUrl: string;
  headed: boolean;
  slowMo: number;
  desktop: boolean;
  /** Keep a trace for this case (written by the caller). */
  trace: boolean;
  runId: string;
}

export async function openBrowser(opts: DriveOptions): Promise<Browser> {
  return chromium.launch({ headless: !opts.headed, slowMo: opts.slowMo });
}

export async function newCaseContext(browser: Browser, opts: DriveOptions): Promise<BrowserContext> {
  // A fresh context per case: the gate's rejection flag lives in localStorage and the
  // visitor id in a cookie, so a shared context would let one case decide the next.
  const context = await browser.newContext({
    userAgent: CHROME_UA,
    viewport: opts.desktop ? { width: 1280, height: 900 } : { width: 390, height: 844 },
    isMobile: !opts.desktop,
    hasTouch: !opts.desktop,
    locale: "en-IN",
  });
  if (opts.trace) await context.tracing.start({ screenshots: true, snapshots: true });
  return context;
}

/** Drive one case. Never throws for a funnel behaviour; throws only for a broken run. */
export async function driveCase(
  context: BrowserContext,
  funnel: Funnel,
  plan: CasePlan,
  opts: DriveOptions,
): Promise<Observation> {
  const page = await context.newPage();
  const identity = identityFor(opts.runId, plan.id);
  const obs: Observation = {
    steps: [],
    exitKey: null,
    exitHeading: null,
    exitButtonLabel: null,
    exitButtonUrl: null,
    questionsSeen: [],
    gateQuestionsSeen: [],
    blocked: null,
    finalUrl: "",
    band: null,
    percent: null,
    score: null,
    max: null,
    submissionId: null,
    visitorId: null,
    externalId: null,
    pixelEvents: [],
    consoleErrors: [],
    crashed: false,
    trail: [],
  };

  page.on("console", (m) => {
    if (m.type() === "error") obs.consoleErrors.push(m.text().slice(0, 300));
  });
  page.on("request", (r) => {
    const url = r.url();
    if (!/facebook\.com\/tr|connect\.facebook\.net/.test(url)) return;
    const ev = new URL(url).searchParams.get("ev");
    if (ev) obs.pixelEvents.push(ev);
  });

  const url = `${opts.baseUrl}/a/${funnel.row.slug}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  obs.trail.push(`opened ${url}`);

  const abandons = plan.behaviours.includes("abandon-at-optin");
  const skipsRequired = plan.behaviours.includes("skip-required");
  const reloadsOnce = plan.behaviours.includes("reload-mid-flow");
  let reloaded = false;

  // A run is a short sequence of screens; the cap is generous and only exists so a
  // funnel that loops cannot hang the sweep.
  const MAX_SCREENS = 120;
  // A screen that will not move on is its own finding: the loop gives it three goes and
  // then stops, rather than filling the same form forty times and timing out the sweep.
  let lastStep = "";
  let sameStepCount = 0;
  for (let i = 0; i < MAX_SCREENS; i++) {
    if (await page.locator("[data-qa-error='boundary']").count()) {
      obs.crashed = true;
      obs.trail.push("the app's error boundary rendered, so the run stopped here");
      break;
    }
    const step = await currentStep(page);
    if (!step) {
      // Either a redirect away from the funnel, or the result page.
      break;
    }
    if (obs.steps[obs.steps.length - 1] !== step) obs.steps.push(step);
    // The fingerprint is the step AND what is on it, because a gate asks nine questions
    // without ever leaving the "qualify" step: guarding on the step alone would call a
    // working gate stuck on its third question.
    const fingerprint = `${step}|${await screenKey(page, step)}`;
    if (fingerprint === lastStep) {
      sameStepCount += 1;
      if (sameStepCount >= 3) {
        obs.trail.push(`stuck on "${fingerprint}" after three attempts, stopping`);
        break;
      }
    } else {
      lastStep = fingerprint;
      sameStepCount = 0;
    }

    if (TERMINAL_STEPS.has(step)) {
      if (step === "disqualified") {
        obs.exitKey = await attr(page, "[data-qa-step='disqualified']", "data-qa-exit");
        obs.exitHeading = (await text(page, "[data-qa-step='disqualified'] h1")) ?? null;
        const btn = page.locator("[data-qa-step='disqualified'] a, [data-qa-step='disqualified'] button").first();
        if (await btn.count()) {
          obs.exitButtonLabel = (await btn.textContent())?.trim() ?? null;
          obs.exitButtonUrl = await btn.getAttribute("href");
        }
      }
      if (step === "resultPages") {
        obs.band = await attr(page, "[data-qa-band]", "data-qa-band");
      }
      obs.trail.push(`reached ${step}`);
      break;
    }

    if (step === "evaluating") {
      // The countdown ends in a redirect; wait for it rather than pressing anything.
      obs.trail.push("waiting out the countdown");
      await page.waitForURL((u) => !u.pathname.endsWith(`/a/${funnel.row.slug}`), { timeout: 45_000 }).catch(() => {});
      if (await currentStep(page) === "evaluating") await page.waitForTimeout(2000);
      continue;
    }

    if (step === "qualify") {
      const done = await answerGateScreen(page, plan, identity, obs);
      if (!done) break;
      continue;
    }

    if (step === "gate") {
      await answerAudience(page, plan, obs);
      continue;
    }

    if (step === "intro") {
      const isOptin = (await attr(page, "[data-qa-step='intro']", "data-qa-optin")) === "first";
      if (isOptin) {
        if (abandons) {
          obs.trail.push("walked away from the opt-in");
          break;
        }
        await fillLead(page, identity, obs);
        await click(page, "[data-qa-nav='optin-submit']", obs);
      } else {
        await click(page, "[data-qa-nav='start']", obs);
      }
      continue;
    }

    if (step === "leadForm") {
      if (abandons) {
        obs.trail.push("walked away from the opt-in");
        break;
      }
      await fillLead(page, identity, obs);
      await click(page, "[data-qa-nav='optin-submit']", obs);
      continue;
    }

    if (step === "questions") {
      if (reloadsOnce && !reloaded) {
        reloaded = true;
        obs.trail.push("reloaded mid-flow");
        await page.reload({ waitUntil: "domcontentloaded" });
        continue;
      }
      const moved = await answerQuestionScreen(page, plan, obs, { skipsRequired });
      if (!moved) break;
      continue;
    }

    if (step === "details") {
      await fillVisibleText(page, identity, obs);
      const next = page.locator("[data-qa-step='details'] button").last();
      await next.click().catch(() => {});
      obs.trail.push("submitted the extra details");
      continue;
    }

    obs.trail.push(`unknown screen "${step}", stopping`);
    break;
  }

  // What the run ended on.
  obs.finalUrl = page.url();
  const m = /\/a\/[^/]+\/r\/([^/?#]+)/.exec(obs.finalUrl);
  obs.submissionId = m?.[1] ?? null;
  if (obs.submissionId) {
    const overall = page.locator("[data-qa-result='overall']").first();
    if (await overall.count()) {
      obs.band = await overall.getAttribute("data-qa-band");
      obs.percent = num(await overall.getAttribute("data-qa-percent"));
      obs.score = num(await overall.getAttribute("data-qa-score"));
      obs.max = num(await overall.getAttribute("data-qa-max"));
    }
  }
  const cookies = await context.cookies();
  obs.visitorId = cookies.find((c) => c.name === "a360_vid")?.value ?? null;
  obs.externalId = await page
    .evaluate(() => {
      try {
        return (globalThis as unknown as { localStorage: { getItem(k: string): string | null } }).localStorage.getItem("a360_xid");
      } catch {
        return null;
      }
    })
    .catch(() => null);

  if (plan.behaviours.includes("back-after-exit")) {
    // Pressing back from the exit page leaves the funnel entirely, because the exit is
    // a client screen rather than a navigation - there is nothing in history to go back
    // TO. The question worth asking is the one the rejection flag exists for: does
    // coming BACK to the funnel let them in? So the funnel is opened again.
    await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
    await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(2000);
    const after = await currentStep(page);
    obs.trail.push(`after coming back to the funnel: ${after ?? "(no funnel screen)"}`);
    if (after) obs.steps.push(`back:${after}`);
  }

  obs.screenshot = await page.screenshot({ fullPage: false }).catch(() => undefined);
  await page.close();
  return obs;
}

/* ---------- screen handlers ----------------------------------------------------- */

async function answerGateScreen(
  page: Page,
  plan: CasePlan,
  identity: Identity,
  obs: Observation,
): Promise<boolean> {
  const block = page.locator("[data-qa-qual-question]").first();
  if (!(await block.count())) {
    obs.trail.push("gate screen with no question on it");
    return false;
  }
  const qid = (await block.getAttribute("data-qa-qual-question")) ?? "";
  if (obs.gateQuestionsSeen[obs.gateQuestionsSeen.length - 1] !== qid) obs.gateQuestionsSeen.push(qid);

  const wantedOption = plan.gateChoices[qid];
  if (wantedOption) {
    const opt = page.locator(`[data-qa-qual-option='${wantedOption}']`);
    if (!(await opt.count())) {
      obs.trail.push(`gate question ${qid}: option ${wantedOption} is not on screen`);
      return false;
    }
    await opt.click();
    obs.trail.push(`gate ${qid}: picked ${wantedOption}`);
    await page.waitForTimeout(500);
    return true;
  }

  // A manual-review text question: type something and continue.
  const input = page.locator("[data-qa-qual-question] input").first();
  if (await input.count()) {
    await input.fill(plan.gateTexts[qid] ?? identity.text);
    await click(page, "[data-qa-nav='qual-continue']", obs);
    return true;
  }
  obs.trail.push(`gate question ${qid}: nothing to answer with`);
  return false;
}

async function answerAudience(page: Page, plan: CasePlan, obs: Observation): Promise<void> {
  const select = page.locator("select#audience-gate");
  if (await select.count()) {
    if (plan.audienceRoleId) {
      await select.selectOption(plan.audienceRoleId);
      obs.trail.push(`audience: picked role ${plan.audienceRoleId}`);
    } else {
      // The plan did not name a role, and the Continue button stays disabled until one
      // is chosen, so the first real option is taken rather than pressing a dead button
      // three times and calling the screen stuck.
      await select.selectOption({ index: 1 }).catch(() => {});
      obs.trail.push("audience: no role in the plan, took the first option");
    }
  } else {
    const input = page.locator("input#audience-gate");
    if (await input.count()) {
      await input.fill(plan.audienceText ?? "");
      obs.trail.push(`audience: typed "${plan.audienceText ?? ""}"`);
      // Close the suggestion list so it cannot swallow the next click.
      await page.keyboard.press("Escape").catch(() => {});
    }
  }
  await click(page, "[data-qa-nav='audience-continue']", obs);
  await page.waitForTimeout(600);
}

async function answerQuestionScreen(
  page: Page,
  plan: CasePlan,
  obs: Observation,
  flags: { skipsRequired: boolean },
  step = "questions",
): Promise<boolean> {
  const blocks = page.locator("[data-qa-question]");
  const count = await blocks.count();
  if (count === 0) {
    obs.trail.push("question screen with no questions on it");
    return false;
  }

  const idsOnScreen: string[] = [];
  for (let i = 0; i < count; i++) {
    const qid = (await blocks.nth(i).getAttribute("data-qa-question")) ?? "";
    if (qid) idsOnScreen.push(qid);
  }
  for (const qid of idsOnScreen) if (!obs.questionsSeen.includes(qid)) obs.questionsSeen.push(qid);

  if (flags.skipsRequired) {
    // Answer nothing and try to move on: the funnel must stop us.
    const before = page.url();
    await click(page, "[data-qa-nav='next'], [data-qa-nav='submit']", obs);
    await page.waitForTimeout(800);
    obs.blocked = await text(page, "[data-qa-step='questions'] .text-red-500");
    obs.trail.push(obs.blocked ? `stopped: ${obs.blocked}` : "was NOT stopped");
    return before !== page.url() ? true : false;
  }

  for (const qid of idsOnScreen) {
    const optionId = plan.answers[qid];
    if (!optionId) continue;
    const radio = page.locator(`[data-qa-question='${qid}'] [data-qa-option='${optionId}']`);
    if (!(await radio.count())) {
      obs.trail.push(`question ${qid}: option ${optionId} is not on screen`);
      continue;
    }
    await radio.check({ force: true }).catch(() => radio.click());
    obs.trail.push(`question ${qid}: picked ${optionId}`);
  }

  // SINGLE mode auto-advances a quarter of a second after the pick. When it has, there
  // is nothing left to press and looking for the button costs a second a question - on
  // a fifteen-question funnel that is most of the case.
  const before = `${step}|${idsOnScreen.join(",")}`;
  for (let waited = 0; waited < 2000; waited += 250) {
    await page.waitForTimeout(250);
    const now = `${(await attr(page, "[data-qa-step]", "data-qa-step")) ?? ""}|${await screenKey(page, "questions")}`;
    if (now !== before) return true;
  }

  const submit = page.locator("[data-qa-nav='submit']");
  const next = page.locator("[data-qa-nav='next']");
  if (await submit.count()) {
    await submit.click().catch(() => {});
    obs.trail.push("submitted the assessment");
    await page.waitForTimeout(1200);
    return true;
  }
  if (await next.count()) {
    await next.click().catch(() => {});
    await page.waitForTimeout(600);
    return true;
  }
  // Neither button: the screen auto-advanced already.
  return true;
}

/* ---------- small helpers ------------------------------------------------------- */

/** What is on the screen right now, so progress inside one step is visible. */
async function screenKey(page: Page, step: string): Promise<string> {
  if (step === "qualify") {
    return (await attr(page, "[data-qa-qual-question]", "data-qa-qual-question")) ?? "";
  }
  if (step === "questions") {
    const ids = await page.locator("[data-qa-question]").evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-qa-question") ?? "").join(","),
    );
    return ids;
  }
  return "";
}

async function currentStep(page: Page): Promise<string | null> {
  const el = page.locator("[data-qa-step]").first();
  try {
    await el.waitFor({ state: "attached", timeout: 15_000 });
  } catch {
    return null;
  }
  return el.getAttribute("data-qa-step");
}

/**
 * Fill a field that may be re-rendered under us.
 *
 * The opt-in form is a controlled React form, so typing into one field re-renders the
 * others and Playwright's fill can lose the element mid-action. That is a fact about
 * the page, not a failure of the funnel, so it is retried rather than reported.
 */
async function safeFill(page: Page, selector: string, value: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const el = page.locator(selector).first();
    if (!(await el.count())) return false;
    try {
      await el.fill(value, { timeout: 8000 });
      return true;
    } catch {
      await page.waitForTimeout(300);
    }
  }
  return false;
}

async function fillLead(page: Page, identity: Identity, obs: Observation): Promise<void> {
  const map: Record<string, string> = {
    firstName: identity.firstName,
    lastName: identity.lastName,
    email: identity.email,
    mobile: identity.mobile,
  };
  for (const [field, value] of Object.entries(map)) {
    const selector = `[data-qa-field='${field}']`;
    if (!(await page.locator(selector).count())) continue;
    const filled = await safeFill(page, selector, value);
    if (!filled) obs.trail.push(`could not fill ${field}`);
  }
  // Extra opt-in fields the owner added: text gets the marker, selects get the first
  // real option, because leaving a required one empty would block the form.
  const extras = page.locator("[data-qa-field^='optin:']");
  const n = await extras.count();
  for (let i = 0; i < n; i++) {
    await extras.nth(i).fill(identity.text, { timeout: 8000 }).catch(() => {});
  }
  // Any dropdown on the form (Profession, or an owner's own select field): take the
  // first REAL option. A required dropdown with no options is a form nobody can
  // submit, and the browser blocks it silently - so that is named, not retried.
  const selects = page.locator("[data-qa-step] select:not(#audience-gate)");
  const sn = await selects.count();
  for (let i = 0; i < sn; i++) {
    const select = selects.nth(i);
    const choices = await select.locator("option:not([disabled])").count();
    const required = (await select.getAttribute("required")) !== null;
    if (choices === 0) {
      obs.trail.push(
        required
          ? "a REQUIRED dropdown on this form has no options, so the form cannot be submitted at all"
          : "a dropdown on this form has no options",
      );
      if (required) obs.blocked = "a required dropdown on the opt-in form has no options to choose";
      continue;
    }
    await select.selectOption({ index: 0 }).catch(async () => {
      await select.selectOption({ index: 1 }).catch(() => {});
    });
  }
  obs.trail.push(`filled the opt-in as ${identity.email}`);
}

async function fillVisibleText(page: Page, identity: Identity, obs: Observation): Promise<void> {
  const inputs = page.locator("[data-qa-step='details'] input, [data-qa-step='details'] textarea");
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    await inputs.nth(i).fill(identity.text, { timeout: 8000 }).catch(() => {});
  }
  if (n > 0) obs.trail.push(`filled ${n} detail field(s)`);
}

/**
 * Click, and do not wait for the button to look ready.
 *
 * The opt-in button disables itself and says "Please wait…" the moment it is pressed,
 * so Playwright's default wait-for-enabled turns a successful submit into a thirty
 * second timeout and then a retry on a button that has already done its job. The click
 * is forced, the timeout is short, and a failure is written down rather than thrown:
 * what matters next is whether the screen changed, and the loop checks that anyway.
 */
async function click(page: Page, selector: string, obs: Observation): Promise<void> {
  const el = page.locator(selector).first();
  if (!(await el.count())) {
    obs.trail.push(`nothing to click for ${selector}`);
    return;
  }
  const before = await fingerprintOf(page);
  try {
    await el.click({ timeout: 8000, force: true });
  } catch (e) {
    obs.trail.push(`click on ${selector} did not settle: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  }
  // Then WAIT for the screen to answer. Submitting the opt-in is a server round trip
  // that can take seconds - the retake lockout is decided inside it - and a fixed
  // half-second wait would read "still on the form" and press the button again.
  const changed = await waitForScreenChange(page, before, 25_000);
  if (!changed) {
    // A screen that refuses to move usually says why, and that sentence is the finding.
    const shown = await text(page, "[data-qa-step] .text-red-500");
    obs.trail.push(`the screen did not change after ${selector}${shown ? `, and it says: ${shown}` : ""}`);
    if (shown) obs.blocked = shown;
  }
}

/** url + step + what is on the step: enough to tell "it moved" from "it did not". */
async function fingerprintOf(page: Page): Promise<string> {
  const step = (await attr(page, "[data-qa-step]", "data-qa-step")) ?? "";
  return `${page.url()}|${step}|${await screenKey(page, step)}`;
}

async function waitForScreenChange(page: Page, before: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(400);
    const now = await fingerprintOf(page).catch(() => before);
    if (now !== before) return true;
  }
  return false;
}

async function attr(page: Page, selector: string, name: string): Promise<string | null> {
  const el = page.locator(selector).first();
  if (!(await el.count())) return null;
  return el.getAttribute(name);
}

async function text(page: Page, selector: string): Promise<string | null> {
  const el = page.locator(selector).first();
  if (!(await el.count())) return null;
  return (await el.textContent())?.trim() ?? null;
}

function num(v: string | null): number | null {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
