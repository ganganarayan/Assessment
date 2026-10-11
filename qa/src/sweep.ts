/**
 * One run of the whole thing: drive every case, read back what the funnel wrote,
 * compare, and keep enough of the evidence to argue about a failure afterwards.
 *
 * Cases run one at a time on purpose. Two reasons, both learned from the app's own
 * code: the event counters are read as a delta around each case, which only works if
 * nothing else is writing them; and recordGateDisqualification rate-limits cold
 * visitors to thirty a minute per IP, so a parallel sweep of rejection cases would
 * silently lose rows and report a feature as broken.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "playwright";
import type { Funnel } from "./config/read.js";
import type { GeneratedCase } from "./cases/generate.js";
import { expectationFor } from "./oracle/expect.js";
import type { OracleContext } from "./oracle/context.js";
import { driveCase, newCaseContext, openBrowser, type DriveOptions, type Observation } from "./drive/run.js";
import { identityFor } from "./drive/identity.js";
import { eventDelta, eventSnapshot, readRows, type EventCounts, type RowObservation } from "./assert/db.js";
import { compare, worst, type Check, type Verdict } from "./assert/compare.js";
import type { Expectation } from "./oracle/types.js";

export interface CaseResult {
  id: string;
  kind: string;
  title: string;
  verdict: Verdict;
  checks: Check[];
  /** Why the case was never driven, when it was not. */
  unreachable?: string;
  expectation?: Expectation;
  observation?: Observation;
  rows?: RowObservation;
  events?: EventCounts;
  identityEmail?: string;
  tracePath?: string;
  screenshotPath?: string;
  seconds: number;
}

export interface SweepResult {
  slug: string;
  baseUrl: string;
  runId: string;
  startedAt: string;
  seconds: number;
  results: CaseResult[];
  outDir: string;
}

export async function sweep(
  funnel: Funnel,
  cases: GeneratedCase[],
  ctx: OracleContext,
  opts: DriveOptions & { outRoot: string },
): Promise<SweepResult> {
  const startedAt = new Date();
  const outDir = join(opts.outRoot, `${startedAt.toISOString().replace(/[:.]/g, "-")}-${funnel.row.slug}`);
  mkdirSync(outDir, { recursive: true });

  const results: CaseResult[] = [];
  let browser: Browser | null = null;
  try {
    browser = await openBrowser(opts);

    for (const [index, c] of cases.entries()) {
      const started = Date.now();
      process.stdout.write(`  [${index + 1}/${cases.length}] ${c.plan.id} ... `);

      if (c.unreachable) {
        results.push({
          id: c.plan.id,
          kind: c.plan.kind,
          title: c.plan.title,
          verdict: "skip",
          checks: [],
          unreachable: c.unreachable,
          seconds: 0,
        });
        console.log(`unreachable: ${c.unreachable}`);
        continue;
      }

      const expectation = expectationFor(funnel, c.plan, ctx);
      const before = await eventSnapshot(funnel.row.id);
      const context = await newCaseContext(browser, opts);
      let observation: Observation | undefined;
      let retakeObs: Observation | undefined;
      try {
        observation = await driveCase(context, funnel, c.plan, opts);
        // The lockout can only be observed by coming back as the same person, which the
        // deterministic identity makes possible.
        if (expectation.expectsRetakeLockout) {
          const second = await newCaseContext(browser, opts);
          try {
            retakeObs = await driveCase(second, funnel, c.plan, opts);
          } finally {
            await second.close();
          }
        }
      } finally {
        if (opts.trace) {
          const tracePath = join(outDir, `${c.plan.id}.trace.zip`);
          await context.tracing.stop({ path: tracePath }).catch(() => {});
        }
        await context.close();
      }

      // Server-side work (CAPI sends, counters, the CRM queue) lands a beat after the
      // browser is done, so give it one before reading rows back.
      await new Promise((r) => setTimeout(r, 2500));
      const identity = identityFor(opts.runId, c.plan.id);
      const rows = await readRows(funnel, identity, observation?.visitorId ?? null);
      const events = eventDelta(before, await eventSnapshot(funnel.row.id));
      const checks = observation
        ? compare(funnel, c.plan, expectation, observation, rows, events, retakeObs)
        : [{ verdict: "fail" as Verdict, what: "the case could be driven at all", observed: "the browser never finished" }];
      const verdict = worst(checks);

      let screenshotPath: string | undefined;
      if (verdict !== "pass" && observation?.screenshot) {
        screenshotPath = join(outDir, `${c.plan.id}.png`);
        writeFileSync(screenshotPath, observation.screenshot);
      }

      const seconds = Math.round((Date.now() - started) / 100) / 10;
      results.push({
        id: c.plan.id,
        kind: c.plan.kind,
        title: c.plan.title,
        verdict,
        checks,
        expectation,
        observation,
        rows,
        events,
        identityEmail: identity.email,
        screenshotPath,
        tracePath: opts.trace ? join(outDir, `${c.plan.id}.trace.zip`) : undefined,
        seconds,
      });

      const failed = checks.filter((x) => x.verdict === "fail").length;
      console.log(
        `${verdict.toUpperCase()}${failed ? ` (${failed} failed check${failed === 1 ? "" : "s"})` : ""} ${seconds}s`,
      );
    }
  } finally {
    if (browser) await browser.close();
  }

  return {
    slug: funnel.row.slug,
    baseUrl: opts.baseUrl,
    runId: opts.runId,
    startedAt: startedAt.toISOString(),
    seconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
    results,
    outDir,
  };
}
