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
import { adminPass, type AdminPassResult } from "./assert/admin.js";
import type { Expectation } from "./oracle/types.js";
import { overrideExpectation, type Overrides } from "./cases/overrides.js";

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
  /** The second run, for the cases that come back as the same person. */
  retakeObservation?: Observation;
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
  /** The same run, seen from the admin screens, when it was asked for. */
  admin?: AdminPassResult;
}

/**
 * Read the rows back, giving the server a moment to finish writing them.
 *
 * A rejection is recorded, and its event counted, by a server action that runs AFTER
 * the exit page is already on screen - so the browser is done before the database is.
 * A fixed pause either waits too long for every case or occasionally too little for
 * one, which showed up as a rejection case failing on its own and passing on a rerun.
 *
 * So the wait is only as long as it needs to be: poll until the rows this case is
 * supposed to have ARE there, then stop. Absence is never hurried - a case expecting
 * no row waits out the whole budget before saying so.
 */
async function settleRows(
  funnel: Funnel,
  identity: ReturnType<typeof identityFor>,
  observation: Observation | undefined,
  expectation: Expectation,
): Promise<RowObservation> {
  const deadline = Date.now() + 12_000;
  let rows = await readRows(funnel, identity, observation?.visitorId ?? null, observation?.externalId ?? null);
  const satisfied = (r: RowObservation): boolean =>
    (!expectation.rows.submission || r.submissionId !== null) &&
    (!expectation.rows.completed || r.status === "COMPLETED") &&
    (!expectation.rows.gateEntry || r.gateEntry) &&
    (!expectation.rows.disqualification || r.disqualifications > 0);
  while (!satisfied(rows) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    rows = await readRows(funnel, identity, observation?.visitorId ?? null, observation?.externalId ?? null);
  }
  return rows;
}

export async function sweep(
  funnel: Funnel,
  cases: GeneratedCase[],
  ctx: OracleContext,
  overrides: Overrides,
  opts: DriveOptions & { outRoot: string; admin: boolean },
): Promise<SweepResult> {
  const startedAt = new Date();
  const outDir = join(opts.outRoot, `${startedAt.toISOString().replace(/[:.]/g, "-")}-${funnel.row.slug}`);
  mkdirSync(outDir, { recursive: true });

  const results: CaseResult[] = [];
  let admin: AdminPassResult | undefined;
  let browser: Browser | null = null;
  try {
    browser = await openBrowser(opts);

    for (const [index, c] of cases.entries()) {
      const started = Date.now();
      // On a terminal the case name and its verdict share a line, which reads well
      // while watching. Redirected to a file, a half-written line sits in a buffer and
      // a healthy sweep looks hung - so there the two are printed separately.
      const live = process.stdout.isTTY === true;
      const label = `  [${index + 1}/${cases.length}] ${c.plan.id}`;
      if (live) process.stdout.write(`${label} ... `);
      else console.log(`${label} ...`);

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
        console.log(live ? `unreachable: ${c.unreachable}` : `${label} -> unreachable: ${c.unreachable}`);
        continue;
      }

      const expectation = overrideExpectation(expectationFor(funnel, c.plan, ctx), overrides.expect[c.plan.id]);
      const before = await eventSnapshot(funnel.row.id);
      const context = await newCaseContext(browser, opts);
      let observation: Observation | undefined;
      let retakeObs: Observation | undefined;
      let crash: string | undefined;
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
      } catch (err) {
        // One case that cannot be driven is a finding about that case, not a reason to
        // abandon the sweep: the remaining cases still have something to say.
        crash = err instanceof Error ? err.message.split("\n")[0] : String(err);
      } finally {
        if (opts.trace) {
          const tracePath = join(outDir, `${c.plan.id}.trace.zip`);
          await context.tracing.stop({ path: tracePath }).catch(() => {});
        }
        await context.close();
      }

      // A case that threw gets the same second chance as one that fell over. The
      // reasons are the same kind of thing - a screen that re-rendered under a read, a
      // page that took too long once - and a single unlucky moment should not be
      // reported as "this case cannot be driven at all", which is a sentence about the
      // harness wearing the clothes of a verdict about the funnel.
      if (crash && !observation) {
        process.stdout.write(`(it threw: ${crash}; retrying) `);
        const retryContext = await newCaseContext(browser, opts);
        try {
          observation = await driveCase(retryContext, funnel, c.plan, opts);
          crash = undefined;
        } catch (err) {
          crash = err instanceof Error ? err.message.split("\n")[0] : String(err);
        } finally {
          await retryContext.close();
        }
      }

      // The app's error boundary is transient by nature (staging Postgres restarts,
      // a cold lambda). One retry, then it is reported as what it is.
      if (observation?.crashed) {
        process.stdout.write("(the funnel fell over, retrying) ");
        const retryContext = await newCaseContext(browser, opts);
        try {
          const second = await driveCase(retryContext, funnel, c.plan, opts);
          if (!second.crashed) observation = second;
        } catch {
          /* keep the first observation */
        } finally {
          await retryContext.close();
        }
      }

      // Server-side work (CAPI sends, counters, the CRM queue) lands a beat after the
      // browser is done, so give it one before reading rows back.
      await new Promise((r) => setTimeout(r, 2500));
      const identity = identityFor(opts.runId, c.plan.id);
      let rows: RowObservation;
      let events: EventCounts;
      try {
        rows = await settleRows(funnel, identity, observation, expectation);
        events = eventDelta(before, await eventSnapshot(funnel.row.id));
      } catch (err) {
        // The reads have their own retry; if they still fail, this case is unjudged and
        // says so, and the sweep carries on. Losing one case beats losing the funnel.
        const why = err instanceof Error ? err.message.split("\n")[0] : String(err);
        results.push({
          id: c.plan.id,
          kind: c.plan.kind,
          title: c.plan.title,
          verdict: "fail",
          checks: [
            {
              verdict: "fail",
              what: "the rows this case wrote can be read back",
              expected: "a database that answers",
              observed: why,
            },
          ],
          expectation,
          observation,
          identityEmail: identity.email,
          seconds: Math.round((Date.now() - started) / 100) / 10,
        });
        console.log(live ? `UNJUDGED (${why})` : `${label} -> UNJUDGED (${why})`);
        continue;
      }
      const checks = observation
        ? compare(funnel, c.plan, expectation, observation, rows, events, retakeObs)
        : [
            {
              verdict: "fail" as Verdict,
              what: "the case can be driven at all",
              expected: "a run from the first screen to an ending",
              observed: crash ?? "the browser never finished",
            },
          ];
      if (crash && observation) {
        checks.push({
          verdict: "warn",
          what: "the browser hit an error part way through, so later checks may be incomplete",
          observed: crash,
        });
      }
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
        retakeObservation: retakeObs,
        rows,
        events,
        identityEmail: identity.email,
        screenshotPath,
        tracePath: opts.trace ? join(outDir, `${c.plan.id}.trace.zip`) : undefined,
        seconds,
      });

      const failed = checks.filter((x) => x.verdict === "fail").length;
      const tail = `${verdict.toUpperCase()}${failed ? ` (${failed} failed check${failed === 1 ? "" : "s"})` : ""} ${seconds}s`;
      console.log(live ? tail : `${label} -> ${tail}`);
    }
    // The owner's side, with the browser still open: the same run read back through
    // the admin screens, using this sweep's own identities as the needle.
    if (opts.admin) {
      const emails = results
        .filter((r) => r.verdict !== "skip" && r.expectation?.rows.completed && r.identityEmail)
        .map((r) => r.identityEmail as string);
      process.stdout.write("  admin screens ... ");
      admin = await adminPass(browser, funnel, opts.runId, emails, opts.baseUrl);
      console.log(
        admin.ran
          ? `${admin.checks.filter((c) => c.verdict === "fail").length} failed check(s)`
          : `skipped: ${admin.why ?? ""}`,
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
    admin,
  };
}
