/**
 * Sign in by typing the credentials into the real form, in this browser context.
 *
 * Shared by the screens pass and the tenancy pass. No API token, no cookie forged from
 * a secret: a session this harness can create and the product cannot is a session that
 * proves nothing about the screens.
 *
 * Returns null on success, otherwise the reason in a sentence.
 */
import type { Page } from "playwright";

export async function signIn(page: Page, baseUrl: string, email: string, password: string): Promise<string | null> {
  // Better Auth throttles sign-in (a few a window per IP). A pass that signs several
  // logins in back to back meets it, and that is the app working, not a refusal: wait
  // out the window and try again, up to three times, before calling it a finding.
  for (let attempt = 0; ; attempt++) {
    const problem = await signInOnce(page, baseUrl, email, password);
    if (!problem?.includes("(429") || attempt >= 3) return problem;
    await page.waitForTimeout(12_000);
  }
}

async function signInOnce(page: Page, baseUrl: string, email: string, password: string): Promise<string | null> {
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
    return `the credentials were refused (${res.status()}${message ? `: ${message}` : ""})`;
  }
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 60_000 }).catch(() => {});
  if (page.url().includes("/sign-in")) {
    return "the password was accepted but the form stayed on /sign-in";
  }
  return null;
}
