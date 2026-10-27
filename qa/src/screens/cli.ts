/**
 * The screens pass.
 *
 *   npm run qa:screens                  every group; the policy pages need no login
 *   npm run qa:screens -- --only=legal,whatsapp
 *   npm run qa:screens -- --headed --slow=250     watch it read
 *
 * It signs in once, visits each screen, and writes the same HTML report the funnel
 * sweep writes, so a failure here reads like a failure there. Nothing is written to the
 * database or to Meta: every group only reads.
 *
 * A group that needs the owner's login is SKIPPED, with the reason, when there are no
 * credentials in qa/.env.qa - so this is still useful on a machine that has none.
 */
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { loadQaEnv, QA_ROOT } from "../env.js";
import { newRunId } from "../drive/identity.js";
import { renderTerminal, writeHtml, writeResultJson } from "../report/render.js";
import type { Check, Verdict } from "../assert/compare.js";
import type { CaseResult, SweepResult } from "../sweep.js";
import { GROUPS } from "./checks.js";

interface Args {
  only: string[];
  headed: boolean;
  desktop: boolean;
  slow: number;
  allowProd: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (!hit) return undefined;
    const eq = hit.indexOf("=");
    return eq === -1 ? "" : hit.slice(eq + 1);
  };
  const has = (name: string) => get(name) !== undefined;
  return {
    only: (get("only") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    headed: has("headed"),
    desktop: has("desktop"),
    slow: Number(get("slow") ?? "0") || 0,
    allowProd: has("i-know-this-is-prod"),
  };
}

/** The worst verdict in the list is the group's verdict. */
function verdictOf(checks: Check[]): Verdict {
  if (checks.some((c) => c.verdict === "fail")) return "fail";
  if (checks.some((c) => c.verdict === "warn")) return "warn";
  if (checks.length === 0) return "skip";
  return "pass";
}

/**
 * Sign in by typing the credentials into the real form, in this browser context.
 *
 * The same way the funnel sweep's admin pass does it: no API token, no cookie forged
 * from a secret, because a session this harness can create and the product cannot is a
 * session that proves nothing about the screens.
 */
async function signIn(page: Page, baseUrl: string, email: string, password: string): Promise<string | null> {
  await page.goto(`${baseUrl}/sign-in`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  /**
   * 🔴 WAIT FOR THE FORM TO HYDRATE BEFORE CLICKING IT.
   *
   * The sign-in form is a client component: until React has attached its handler, the
   * submit button does nothing whatsoever - no request leaves the browser and the page
   * just sits there. Staging serves this page in about ten seconds cold, which loses
   * that race every time, and the symptom is indistinguishable from a wrong password.
   * That is why the request itself is watched for below: "the form never asked" and
   * "the server said no" are different findings and must not arrive as one.
   */
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  const answered = page
    .waitForResponse((r) => r.url().includes("/api/auth/sign-in"), { timeout: 60_000 })
    .catch(() => null);
  await page.locator("button[type='submit']").click();
  const res = await answered;
  if (!res) {
    return "the form never sent a sign-in request - it had not hydrated when it was clicked";
  }
  if (!res.ok()) {
    const body = await res.text().catch(() => "");
    const message = /"message"\s*:\s*"([^"]+)"/.exec(body)?.[1];
    return `the credentials in qa/.env.qa were refused (${res.status()}${message ? `: ${message}` : ""})`;
  }
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 60_000 }).catch(() => {});
  if (page.url().includes("/sign-in")) {
    return "the password was accepted but the form stayed on /sign-in";
  }
  return null;
}

async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const env = loadQaEnv();

  console.log(`Screens on ${env.baseUrl}`);
  if (env.looksLikeProd && !args.allowProd) {
    console.log(
      "\nRefusing to run: that host does not look like staging. This pass only reads, but it does sign in, so pass --i-know-this-is-prod to override.",
    );
    return 1;
  }

  const groups = GROUPS.filter((g) => args.only.length === 0 || args.only.includes(g.id));
  if (groups.length === 0) {
    console.log(`\nNothing to run. Groups: ${GROUPS.map((g) => g.id).join(", ")}`);
    return 1;
  }

  const startedAt = new Date();
  const outDir = join(
    resolve(QA_ROOT, "reports"),
    `${startedAt.toISOString().replace(/[:.]/g, "-")}-screens`,
  );
  mkdirSync(outDir, { recursive: true });

  const haveAdmin = !!env.adminEmail && !!env.adminPassword;
  // Which half is missing is worth saying out loud: adding a password line is a
  // different job from creating the file, and a report that says only "no credentials"
  // sends somebody looking for a file that is already sitting there.
  const missingCreds =
    !env.adminEmail && !env.adminPassword
      ? "qa/.env.qa has neither QA_ADMIN_EMAIL nor QA_ADMIN_PASSWORD"
      : !env.adminEmail
        ? "QA_ADMIN_EMAIL is empty in qa/.env.qa"
        : "QA_ADMIN_PASSWORD is empty in qa/.env.qa";
  const browser: Browser = await chromium.launch({ headless: !args.headed, slowMo: args.slow });
  const context = await browser.newContext({
    viewport: args.desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 },
    // Mobile first, so the screens are read the way most owners open them.
    isMobile: !args.desktop,
    hasTouch: !args.desktop,
  });
  const page = await context.newPage();
  const results: CaseResult[] = [];
  let signInProblem: string | null = null;

  try {
    if (haveAdmin && groups.some((g) => g.needsAdmin)) {
      signInProblem = await signIn(page, env.baseUrl, env.adminEmail, env.adminPassword);
      results.push({
        id: "sign-in",
        kind: "screens",
        title: "The owner can sign in to look at their own screens",
        verdict: signInProblem ? "fail" : "pass",
        checks: [
          {
            verdict: signInProblem ? "fail" : "pass",
            what: "signing in with the credentials in qa/.env.qa",
            expected: "signed in",
            observed: signInProblem ?? page.url(),
          },
        ],
        seconds: 0,
      });
    }

    for (const group of groups) {
      const began = Date.now();
      console.log(`\n${group.id}: ${group.title}`);

      if (group.needsAdmin && !haveAdmin) {
        results.push({
          id: group.id,
          kind: "screens",
          title: group.title,
          verdict: "skip",
          unreachable: `${missingCreds}, so the owner's screens were not opened`,
          checks: [],
          seconds: 0,
        });
        console.log(`  skipped: ${missingCreds}`);
        continue;
      }
      if (group.needsAdmin && signInProblem) {
        results.push({
          id: group.id,
          kind: "screens",
          title: group.title,
          verdict: "skip",
          unreachable: `not opened: ${signInProblem}`,
          checks: [],
          seconds: 0,
        });
        console.log(`  skipped: ${signInProblem}`);
        continue;
      }

      let checks: Check[];
      try {
        checks = await group.run(page, env.baseUrl);
      } catch (e) {
        // A thrown selector or a navigation timeout is a finding about the screen, not a
        // crash of the harness: it is reported and the rest of the groups still run.
        checks = [
          {
            verdict: "fail",
            what: "reading this screen at all",
            expected: "a screen that can be read",
            observed: e instanceof Error ? e.message.split("\n")[0] ?? e.message : String(e),
          },
        ];
      }

      const shot = join(outDir, `${group.id}.png`);
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});

      for (const c of checks) {
        if (c.verdict === "pass") continue;
        console.log(`  ${c.verdict.toUpperCase()}: ${c.what}`);
        if (c.expected !== undefined) console.log(`     expected ${c.expected}`);
        if (c.observed !== undefined) console.log(`     observed ${c.observed}`);
      }
      const verdict = verdictOf(checks);
      console.log(`  ${checks.filter((c) => c.verdict === "pass").length}/${checks.length} checks passed`);

      results.push({
        id: group.id,
        kind: "screens",
        title: group.title,
        verdict,
        checks,
        screenshotPath: shot,
        seconds: Math.round((Date.now() - began) / 100) / 10,
      });
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const result: SweepResult = {
    slug: "screens",
    baseUrl: env.baseUrl,
    runId: newRunId(),
    startedAt: startedAt.toISOString(),
    seconds: Math.round((Date.now() - startedAt.getTime()) / 100) / 10,
    results,
    outDir,
  };

  console.log(renderTerminal(result));
  const htmlPath = writeHtml(result);
  writeResultJson(result);
  console.log(`Open it: ${htmlPath}`);

  return results.some((r) => r.verdict === "fail") ? 1 : 0;
}

run(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(`\nFailed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
