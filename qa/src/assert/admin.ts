/**
 * The owner's side of the same run.
 *
 * A funnel can behave perfectly for the respondent and still be wrong for the person
 * who paid for the traffic: the lead lands in the database but the submissions screen
 * scopes it to the wrong tenant, or the export leaves out the gate's answers, or the
 * stats count a rejection as a visit. So each sweep can also ask the admin surface
 * what it thinks happened, using the same run's identities as the needle.
 *
 * It signs in by typing the credentials from qa/.env.qa into the real form, in the
 * harness's own browser context, and then reads the export endpoints with that
 * session. Nothing is written: this pass only reads.
 */
import type { Browser } from "playwright";
import { loadQaEnv } from "../env.js";
import { runPrefix } from "../drive/identity.js";
import type { Check } from "./compare.js";
import type { Funnel } from "../config/read.js";

export interface AdminPassResult {
  ran: boolean;
  why?: string;
  checks: Check[];
}

export async function adminPass(
  browser: Browser,
  funnel: Funnel,
  runId: string,
  expectedEmails: string[],
  baseUrl: string,
): Promise<AdminPassResult> {
  const env = loadQaEnv();
  if (!env.adminEmail || !env.adminPassword) {
    return {
      ran: false,
      why: "no QA_ADMIN_EMAIL / QA_ADMIN_PASSWORD in qa/.env.qa, so the admin screens were not checked",
      checks: [],
    };
  }
  if (expectedEmails.length === 0) {
    return { ran: false, why: "no completed respondents in this sweep to look for", checks: [] };
  }

  const checks: Check[] = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/sign-in`, { waitUntil: "domcontentloaded" });
    await page.locator("#email").fill(env.adminEmail);
    await page.locator("#password").fill(env.adminPassword);
    await page.locator("button[type='submit']").click();
    await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 30_000 }).catch(() => {});

    const signedIn = !page.url().includes("/sign-in");
    checks.push({
      verdict: signedIn ? "pass" : "fail",
      what: "the owner can sign in to look at the run",
      expected: "signed in",
      observed: page.url(),
    });
    if (!signedIn) return { ran: true, checks };

    // The submissions export, scoped to this assessment: the one view that is supposed
    // to contain every respondent the funnel accepted.
    const res = await page.request.get(
      `${baseUrl}/api/admin/submissions/export?format=json&assessment=${funnel.row.id}`,
    );
    if (!res.ok()) {
      checks.push({
        verdict: "fail",
        what: "the submissions export answers",
        expected: "200",
        observed: `${res.status()} ${res.statusText()}`,
      });
      return { ran: true, checks };
    }
    const body = (await res.text()).toLowerCase();
    const missing = expectedEmails.filter((e) => !body.includes(e.toLowerCase()));
    checks.push({
      verdict: missing.length === 0 ? "pass" : "fail",
      what: "every respondent this sweep created appears in the export",
      expected: `${expectedEmails.length} respondent(s)`,
      observed: missing.length === 0 ? "all present" : `missing ${missing.join(", ")}`,
    });

    // And nobody else's run leaked into a scoped export.
    const prefix = runPrefix(runId);
    const strays = (body.match(/qa\+[a-z0-9]+-/g) ?? []).filter((m) => !prefix.startsWith(m));
    if (strays.length > 0) {
      checks.push({
        verdict: "warn",
        what: "the export also contains earlier QA runs",
        observed: `${new Set(strays).size} other run prefix(es) - expected on a shared staging funnel, worth knowing`,
      });
    }

    // The stats screen, which is the number the owner actually reads.
    const stats = await page.request.get(`${baseUrl}/api/admin/stats/export?assessment=${funnel.row.id}`);
    checks.push({
      verdict: stats.ok() ? "pass" : "warn",
      what: "the stats export answers for this funnel",
      expected: "200",
      observed: `${stats.status()}`,
    });
  } finally {
    await context.close();
  }

  return { ran: true, checks };
}
