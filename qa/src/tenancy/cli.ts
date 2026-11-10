/**
 * The tenancy pass: Phases 1 and 2 of the multi-tenant review, driven for real.
 *
 *   npm run qa:tenancy                       seed, run every case, clean up
 *   npm run qa:tenancy -- --keep             leave the qa-tn- workspaces behind to look at
 *   npm run qa:tenancy -- --cleanup          only remove every qa-tn- row of every run
 *   npm run qa:tenancy -- --headed --slow=250
 *
 * scripts/verify-isolation.ts and verify-lifecycle.ts already pin each fix in the source,
 * in the build. A pin proves the line is there. It cannot prove the line WORKS on the
 * deployed app: that a suspended login really lands on the unavailable page, that a
 * forged email link really goes home, that a permanent delete really leaves nothing
 * behind for the platform to inherit. This pass asks the live staging app those
 * questions, through the same doors a person or an attacker would use: the sign-in form,
 * the platform console's own buttons, the public funnel URL, the public API endpoints.
 *
 * It needs:
 *  - QA_ADMIN_EMAIL / QA_ADMIN_PASSWORD in qa/.env.qa (the QA super admin made by
 *    `npm run qa:admin`), for the console cases.
 *  - the staging database (QA_DATABASE_URL), to seed and to read the result.
 *  - OPTIONAL: BETTER_AUTH_SECRET in the environment (`railway run --service Assessment`
 *    injects it). Only the two cases that must SIGN something as the app would need it,
 *    the Razorpay webhook and a valid email link; without it they skip and say so. It is
 *    read from the process and never printed or written anywhere.
 *
 * What it writes: two qa-tn- workspaces with their logins and funnels, one more made
 * through the console form, one more made through public signup, and a handful of rows
 * for the purge to remove. All of it is removed at the end (audit rows stay: outliving
 * the workspace is their job). Nothing reaches Meta: no pixel or CAPI token is set on
 * any of these workspaces, and every capture row is marked as a fixture.
 */
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { loadQaEnv, QA_ROOT } from "../env.js";
import { closeDb, db, withDbRetry } from "../db.js";
import { newRunId } from "../drive/identity.js";
import { signIn } from "../drive/sign-in.js";
import { renderTerminal, writeHtml, writeResultJson } from "../report/render.js";
import type { Check, Verdict } from "../assert/compare.js";
import type { CaseResult, SweepResult } from "../sweep.js";
import { cleanupTenancy, PREFIX, seedTenancy, type Seed } from "./seed.js";
import { encryptWithSecret } from "../../../src/lib/crypto.js";
import { encodeTrackedUrl, trackedUrlSignature } from "../../../src/lib/nurture/tracking.js";
import { tenantAppSettingId } from "../../../src/lib/settings/tenant-row.js";

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const ok = (what: string, cond: boolean, expected: string, observed: string): Check => ({
  verdict: cond ? "pass" : "fail",
  what,
  expected,
  observed,
});
const skip = (what: string, why: string): Check => ({ verdict: "skip", what, observed: why });
const warn = (what: string, observed: string): Check => ({ verdict: "warn", what, observed });

/** Poll a database read until it says yes, or give up. Rows land after the screen does. */
async function until<T>(read: () => Promise<T>, done: (v: T) => boolean, seconds = 30): Promise<T> {
  const end = Date.now() + seconds * 1000;
  let last = await withDbRetry(read);
  while (!done(last) && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 1500));
    last = await withDbRetry(read);
  }
  return last;
}

async function get(url: string, init: RequestInit = {}): Promise<{ status: number; location: string; text: string }> {
  const res = await fetch(url, { redirect: "manual", ...init, headers: { "user-agent": UA, ...(init.headers ?? {}) } });
  return { status: res.status, location: res.headers.get("location") ?? "", text: await res.text().catch(() => "") };
}

const PAUSED = /accepting responses right now/;

/** Is this public funnel serving, as a respondent opening the link sees it. */
async function funnelServes(baseUrl: string, slug: string): Promise<{ serving: boolean; observed: string }> {
  const r = await get(`${baseUrl}/a/${slug}`);
  if (r.status !== 200) return { serving: false, observed: `HTTP ${r.status}` };
  return PAUSED.test(r.text) ? { serving: false, observed: "the paused page" } : { serving: true, observed: "the funnel" };
}

function pathOf(page: Page): string {
  try {
    return new URL(page.url()).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return page.url();
  }
}

/** Open a /w path as the signed-in person and report where they were actually put. */
async function landOn(page: Page, baseUrl: string, path: string): Promise<{ path: string; text: string }> {
  await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  return { path: pathOf(page), text: await page.locator("body").innerText().catch(() => "") };
}

/** The console row for one workspace, matched by its slug cell, never by its name. */
function consoleRow(page: Page, slug: string) {
  return page.locator("tr").filter({ has: page.getByText(slug, { exact: true }) });
}

async function openConsole(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/platform`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  // The buttons are a client component; a click before hydration does nothing at all.
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

/** Click a console button, answering its confirm or prompt dialog. */
async function clickInRow(page: Page, slug: string, button: string, promptAnswer?: string): Promise<void> {
  // Not page.once: some buttons ask nothing (Unsuspend), and a listener left armed by one
  // of those answers the NEXT button's dialog a second time, which throws. So the
  // listener lives exactly as long as this click.
  const answer = (d: import("playwright").Dialog) => {
    void (d.type() === "prompt" ? d.accept(promptAnswer ?? "") : d.accept()).catch(() => {});
  };
  page.on("dialog", answer);
  try {
    await consoleRow(page, slug).getByRole("button", { name: button, exact: true }).first().click({ timeout: 30_000 });
    // A dialog opens synchronously from the click handler; give it a beat to arrive.
    await page.waitForTimeout(1500);
  } finally {
    page.off("dialog", answer);
  }
}

async function lastAudit(action: string, tenantId: string, since: Date) {
  return until(
    () => db().auditLog.findFirst({ where: { action, tenantId, createdAt: { gte: since } }, orderBy: { createdAt: "desc" } }),
    (r) => r !== null,
    20,
  );
}

/* -------------------------------------------------------------------------- */
/* The cases                                                                   */
/* -------------------------------------------------------------------------- */

interface Ctx {
  baseUrl: string;
  seed: Seed;
  secret: string;
  emailDomain: string;
  owner: Page | null;
  ownerProblem: string | null;
  newPage: () => Promise<Page>;
  /** The workspace public signup made, shared by the delete and purge case. */
  signup: { email: string; password: string; tenantId: string; slug: string } | null;
}

interface Case {
  id: string;
  title: string;
  needsOwner?: boolean;
  run(c: Ctx): Promise<Check[]>;
}

const emailLink: Case = {
  id: "p1-email-link",
  title: "Phase 1: an email click link we did not sign goes home, never to the site it names",
  async run(c) {
    const checks: Check[] = [];
    const evil = "https://evil.example/qa-phish";
    const u = encodeTrackedUrl(evil);
    const id = `${PREFIX}forged-${c.seed.runId}`;
    const home = (loc: string) => !loc.includes("evil.example");

    const forged = await get(`${c.baseUrl}/e/c/${id}?u=${u}&s=${"A".repeat(22)}`);
    checks.push(ok("a link with a forged signature redirects", forged.status === 302, "302", String(forged.status)));
    checks.push(ok("a forged link does not go where it names", home(forged.location), "home", forged.location || "(no location)"));

    const unsigned = await get(`${c.baseUrl}/e/c/${id}?u=${u}`);
    checks.push(ok("an unsigned link for an email we never sent does not go where it names", home(unsigned.location), "home", unsigned.location || "(no location)"));

    if (!c.secret) {
      checks.push(skip("a link we DID sign is followed (proves the refusals above are the signature, not a broken route)", "BETTER_AUTH_SECRET is not in the environment; run under `railway run --service Assessment`"));
    } else {
      const target = "https://example.com/qa-signed";
      const ue = encodeTrackedUrl(target);
      const signed = await get(`${c.baseUrl}/e/c/${id}?u=${ue}&s=${trackedUrlSignature(id, ue, c.secret)}`);
      checks.push(ok("a link we DID sign is followed (so the refusals above are the signature at work)", signed.location === target, target, signed.location || `HTTP ${signed.status}`));
    }
    return checks;
  },
};

const purchaseEventId: Case = {
  id: "p1-purchase-eventid",
  title: "Phase 1: the public purchase event-id lookup answers with the owner's captures only",
  async run(c) {
    const q = (rupees: number) => `${c.baseUrl}/api/v1/purchase-eventid/latest?window=1800&min=${rupees}&max=${rupees + 0.02}`;
    const own = await get(q(c.seed.capturePlatform.rupees));
    const other = await get(q(c.seed.captureB.rupees));
    const parse = (t: string): { found?: boolean; event_id?: string } => {
      try {
        return JSON.parse(t) as { found?: boolean; event_id?: string };
      } catch {
        return {};
      }
    };
    const a = parse(own.text);
    const b = parse(other.text);
    return [
      ok("a platform capture IS returned (the endpoint works)", a.found === true && a.event_id === c.seed.capturePlatform.paymentId, c.seed.capturePlatform.paymentId, a.event_id ?? `found=${String(a.found)} HTTP ${own.status}`),
      ok("a business workspace's capture is NOT returned", b.found === false, "found=false", b.event_id ? `leaked ${b.event_id}` : `found=${String(b.found)} HTTP ${other.status}`),
    ];
  },
};

const apiTokens: Case = {
  id: "p1-api-tokens",
  title: "Phase 1: a workspace's API Tokens screen lists its own tokens and nobody else's",
  async run(c) {
    const page = await c.newPage();
    const problem = await signIn(page, c.baseUrl, c.seed.b.adminEmail, c.seed.b.adminPassword);
    if (problem) return [ok("workspace B's admin can sign in", false, "signed in", problem)];
    const v = await landOn(page, c.baseUrl, "/w/api");
    return [
      ok("/w/api opens for workspace B", v.path === "/w/api", "/w/api", v.path),
      ok("B's own token is listed", v.text.includes(c.seed.tokenLabelB), c.seed.tokenLabelB, v.text.includes(c.seed.tokenLabelB) ? "listed" : "missing"),
      ok("A's token is NOT listed to B", !v.text.includes(c.seed.tokenLabelA), "absent", v.text.includes(c.seed.tokenLabelA) ? `${c.seed.tokenLabelA} is on B's screen` : "absent"),
    ];
  },
};

const razorpayWebhook: Case = {
  id: "p1-razorpay-webhook",
  title: "Phase 1: a workspace's signed Razorpay webhook cannot settle another workspace's lead",
  async run(c) {
    if (!c.secret) {
      return [skip("the cross-tenant webhook case", "BETTER_AUTH_SECRET is not in the environment, so A's webhook secret cannot be stored the way the app reads it; run under `railway run --service Assessment`")];
    }
    const { a, b, runId } = c.seed;
    const hookSecret = randomBytes(16).toString("hex");
    await withDbRetry(() =>
      db().appSetting.upsert({
        where: { id: tenantAppSettingId(a.id) },
        create: { id: tenantAppSettingId(a.id), tenantId: a.id, razorpayWebhookSecretEnc: encryptWithSecret(hookSecret, c.secret) },
        update: { razorpayWebhookSecretEnc: encryptWithSecret(hookSecret, c.secret) },
        // Read back the id ONLY. The client is generated from the checkout's schema, which
        // can carry another session's not-yet-migrated column, and a full read-back then
        // fails on a column the staging database does not have.
        select: { id: true },
      }),
    );
    const send = async (paymentId: string, submissionId: string, sign = true) => {
      const body = JSON.stringify({
        event: "payment.captured",
        payload: { payment: { entity: { id: paymentId, amount: 100, currency: "INR", status: "captured", email: `${PREFIX}payer-${runId}@${c.emailDomain}`, notes: { submissionId } } } },
      });
      const sig = sign ? createHmac("sha256", hookSecret).update(body).digest("hex") : "0".repeat(64);
      const res = await fetch(`${c.baseUrl}/api/payments/razorpay/${a.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-razorpay-signature": sig, "user-agent": UA },
        body,
      });
      return res.status;
    };

    const checks: Check[] = [];
    const bad = await send(`pay_qatnz${runId}`, a.submissionId, false);
    checks.push(ok("a webhook with a wrong signature is refused", bad === 400, "400", String(bad)));

    const ownId = `pay_qatny${runId}`;
    const own = await send(ownId, a.submissionId);
    const ownRow = await until(() => db().payment.findUnique({ where: { providerPaymentId: ownId }, select: { tenantId: true } }), (r) => r !== null, 20);
    checks.push(ok("A's webhook settles A's OWN lead (the path works)", own === 200 && ownRow?.tenantId === a.id, `200 and a payment on ${a.slug}`, `HTTP ${own}, ${ownRow ? `payment on ${ownRow.tenantId}` : "no payment row"}`));

    const crossId = `pay_qatnx${runId}`;
    const cross = await send(crossId, b.submissionId);
    // Wait as long as the control took to land, and then some, before calling it absent.
    await new Promise((r) => setTimeout(r, 6000));
    const crossRow = await withDbRetry(() => db().payment.findUnique({ where: { providerPaymentId: crossId }, select: { tenantId: true } }));
    checks.push(ok("A's webhook naming B's lead records NO payment", cross === 200 && crossRow === null, "no payment row", crossRow ? `payment recorded on ${crossRow.tenantId}` : `none (HTTP ${cross})`));

    const capi = await until(() => db().capiLog.findUnique({ where: { providerPaymentId: crossId }, select: { submissionId: true, tenantId: true } }), (r) => r !== null, 10);
    if (!capi) checks.push(warn("the capture was logged for CAPI", "no capi row appeared (fire-and-forget), so attribution could not be read"));
    else checks.push(ok("the CAPI capture is NOT attributed to B's lead", capi.submissionId !== b.submissionId, "not B's submission", capi.submissionId === b.submissionId ? "attributed to B's lead" : `submission ${capi.submissionId ?? "none"} on ${capi.tenantId ?? "platform"}`));
    return checks;
  },
};

const signup: Case = {
  id: "p2-signup",
  title: "Phase 2: public signup refuses throwaway inboxes and never takes a reserved name",
  async run(c) {
    const checks: Check[] = [];
    const password = randomBytes(18).toString("base64url");
    const post = (email: string, name: string) =>
      fetch(`${c.baseUrl}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: c.baseUrl, "user-agent": UA },
        body: JSON.stringify({ email, password, name }),
      });

    const throwaway = `${PREFIX}${c.seed.runId}@mailinator.com`;
    const r1 = await post(throwaway, "QA Throwaway");
    const r1Text = await r1.text().catch(() => "");
    const made = await withDbRetry(() => db().user.findFirst({ where: { email: throwaway }, select: { id: true } }));
    checks.push(ok("a mailinator address is refused", r1.status >= 400 && r1.status < 500, "4xx", `HTTP ${r1.status}`));
    checks.push(ok("the refusal says why in words", /Temporary inboxes/i.test(r1Text), "Temporary inboxes can't be used", r1Text.slice(0, 120)));
    checks.push(ok("no login was created for it", made === null, "none", made ? "a user row exists" : "none"));

    const email = `${PREFIX}signup-${c.seed.runId}@${c.emailDomain}`;
    const r2 = await post(email, "Admin");
    const r2Text = await r2.text().catch(() => "");
    checks.push(ok("a normal signup goes through", r2.ok, "2xx", `HTTP ${r2.status} ${r2.ok ? "" : r2Text.slice(0, 120)}`));
    if (r2.status === 429) checks.push(warn("signup throttle", "this IP has hit 20 signups this hour; the throttle works, rerun later"));
    const user = await until(
      () => db().user.findFirst({ where: { email }, select: { role: true, tenant: { select: { id: true, slug: true, trialEndsAt: true } } } }),
      (u) => !!u?.tenant,
      30,
    );
    const t = user?.tenant ?? null;
    checks.push(ok("the login is linked to its new workspace, as its admin", !!t && user?.role === "ADMIN", "ADMIN of a workspace", t ? `${user?.role} of ${t.slug}` : "no workspace linked"));
    checks.push(ok("a workspace named \"Admin\" does not get the reserved slug", !!t && t.slug !== "admin" && t.slug.startsWith("admin-ws"), "admin-ws...", t?.slug ?? "none"));
    checks.push(ok("the workspace starts on its trial", !!t?.trialEndsAt && t.trialEndsAt.getTime() > Date.now(), "a trial end in the future", t?.trialEndsAt?.toISOString() ?? "none"));
    if (t) c.signup = { email, password, tenantId: t.id, slug: t.slug };
    return checks;
  },
};

const overPlan: Case = {
  id: "p2-over-plan",
  title: "Phase 2: past the plan's funnel limit, the newest published funnel pauses and the earliest stay live",
  async run(c) {
    const [f1, f2, f3] = c.seed.a.funnels;
    if (!f1 || !f2 || !f3) return [ok("three funnels were seeded", false, "3", String(c.seed.a.funnels.length))];
    const checks: Check[] = [];
    for (const [slug, live] of [[f1, true], [f2, true], [f3, false]] as const) {
      const r = await funnelServes(c.baseUrl, slug);
      checks.push(ok(`${slug} ${live ? "stays live" : "is paused"} (Gate plan: 2 live funnels)`, r.serving === live, live ? "the funnel" : "the paused page", r.observed));
    }
    const page = await c.newPage();
    const problem = await signIn(page, c.baseUrl, c.seed.a.adminEmail, c.seed.a.adminPassword);
    if (problem) {
      checks.push(ok("workspace A's admin can sign in", false, "signed in", problem));
      return checks;
    }
    const v = await landOn(page, c.baseUrl, "/w/assessments");
    checks.push(ok("/w/assessments opens for workspace A", v.path === "/w/assessments", "/w/assessments", v.path));
    checks.push(ok("the Assessments screen says one funnel is paused and why", /1 published funnel is paused/.test(v.text), "1 published funnel is paused: your plan includes 2 live funnels", /published funnel/.test(v.text) ? v.text.match(/\d+ published funnels? (is|are) paused[^.]*/)?.[0] ?? "other wording" : "no notice"));
    return checks;
  },
};

const suspend: Case = {
  id: "p2-suspend",
  title: "Phase 2: Suspend from the console locks the workspace out, pauses its funnels, is audited, and Unsuspend puts it back",
  needsOwner: true,
  async run(c) {
    const owner = c.owner!;
    const { a } = c.seed;
    const f1 = a.funnels[0] ?? "";
    const checks: Check[] = [];
    const tenantPage = await c.newPage();
    const problem = await signIn(tenantPage, c.baseUrl, a.adminEmail, a.adminPassword);
    if (problem) return [ok("workspace A's admin can sign in", false, "signed in", problem)];
    const before = await landOn(tenantPage, c.baseUrl, "/w");
    checks.push(ok("before: A's admin reaches the workspace", before.path.startsWith("/w"), "/w", before.path));

    const t0 = new Date();
    await openConsole(owner, c.baseUrl);
    await clickInRow(owner, a.slug, "Suspend");
    const s = await until(() => db().tenant.findUnique({ where: { id: a.id }, select: { status: true } }), (r) => r?.status === "SUSPENDED");
    checks.push(ok("the console's Suspend button suspends the workspace", s?.status === "SUSPENDED", "SUSPENDED", s?.status ?? "missing"));
    const au = await lastAudit("tenant.suspend", a.id, t0);
    checks.push(ok("the suspension is in the audit log, with who did it", !!au && au.actorEmail.length > 0, "a tenant.suspend row", au ? `by ${au.actorEmail}` : "no row"));

    const during = await landOn(tenantPage, c.baseUrl, "/w");
    checks.push(ok("A's admin is turned away to /workspace-unavailable", during.path === "/workspace-unavailable", "/workspace-unavailable", during.path));
    checks.push(ok("the page says suspended, and that nothing is deleted", /suspended/i.test(during.text) && /Nothing has been deleted/i.test(during.text), "This workspace is suspended", during.text.slice(0, 120)));
    const fs = await funnelServes(c.baseUrl, f1);
    checks.push(ok("A's live funnel shows the paused page while suspended", !fs.serving, "the paused page", fs.observed));

    const auditScreen = await landOn(owner, c.baseUrl, "/platform/audit");
    checks.push(ok("/platform/audit lists the suspension", auditScreen.path === "/platform/audit" && auditScreen.text.includes("Suspended the workspace."), "Suspended the workspace.", auditScreen.path !== "/platform/audit" ? `landed on ${auditScreen.path}` : auditScreen.text.includes("Suspended the workspace.") ? "listed" : "not listed"));
    const monthFirst = [...auditScreen.text.matchAll(/\b(\d{1,2})-(\d{1,2})-(20\d\d)\b/g)].filter((m) => Number(m[2]) > 12).map((m) => m[0]);
    checks.push(ok("/platform/audit dates are DD-MM-YYYY", monthFirst.length === 0, "DD-MM-YYYY", monthFirst.join(", ") || "none month-first"));

    const t1 = new Date();
    await openConsole(owner, c.baseUrl);
    await clickInRow(owner, a.slug, "Unsuspend");
    const u = await until(() => db().tenant.findUnique({ where: { id: a.id }, select: { status: true } }), (r) => r?.status === "ACTIVE");
    checks.push(ok("Unsuspend puts the workspace back", u?.status === "ACTIVE", "ACTIVE", u?.status ?? "missing"));
    const au2 = await lastAudit("tenant.unsuspend", a.id, t1);
    checks.push(ok("the unsuspension is audited too", !!au2, "a tenant.unsuspend row", au2 ? "recorded" : "no row"));
    const after = await landOn(tenantPage, c.baseUrl, "/w");
    checks.push(ok("after: A's admin reaches the workspace again", after.path.startsWith("/w"), "/w", after.path));
    const fs2 = await funnelServes(c.baseUrl, f1);
    checks.push(ok("after: A's funnel serves again", fs2.serving, "the funnel", fs2.observed));
    return checks;
  },
};

const createTenant: Case = {
  id: "p2-console-create",
  title: "Phase 2: the console refuses a reserved slug, and a typed-in password must be changed at first sign-in",
  needsOwner: true,
  async run(c) {
    const owner = c.owner!;
    const checks: Check[] = [];
    const email = `${PREFIX}c-${c.seed.runId}@${c.emailDomain}`;
    const password = randomBytes(18).toString("base64url");
    const name = `QA Tenancy C ${c.seed.runId}`;
    const fill = async (slug: string) => {
      await openConsole(owner, c.baseUrl);
      await owner.getByPlaceholder("Gita Clarity").fill(name);
      await owner.getByPlaceholder("admin@brand.com").fill(email);
      await owner.getByPlaceholder("min 8 chars").fill(password);
      await owner.getByPlaceholder("auto from name").fill(slug);
      await owner.getByRole("button", { name: "Create tenant", exact: true }).click();
    };

    await fill("admin");
    await owner.getByText(/reserved by the platform/).first().waitFor({ timeout: 30_000 }).catch(() => {});
    const said = await owner.getByText(/reserved by the platform/).count();
    const madeUser = await withDbRetry(() => db().user.findFirst({ where: { email }, select: { id: true } }));
    checks.push(ok("the slug \"admin\" is refused with a reason", said > 0, "\"admin\" is reserved by the platform", said > 0 ? "said so" : "no message on screen"));
    checks.push(ok("nothing was created by the refused attempt", madeUser === null, "no login", madeUser ? "a login was created" : "none"));

    const slug = `${PREFIX}c-${c.seed.runId}`;
    const t0 = new Date();
    await fill(slug);
    const t = await until(() => db().tenant.findUnique({ where: { slug }, select: { id: true, trialEndsAt: true, users: { select: { email: true, mustChangePassword: true } } } }), (r) => !!r && r.users.length > 0);
    const admin = t?.users.find((x) => x.email === email);
    checks.push(ok("the workspace and its admin are created together", !!t && !!admin, "workspace + login", t ? `${t.users.length} login(s)` : "no workspace"));
    checks.push(ok("the typed-in password is marked to be changed", admin?.mustChangePassword === true, "mustChangePassword", String(admin?.mustChangePassword)));
    if (t) {
      const au = await lastAudit("tenant.create", t.id, t0);
      checks.push(ok("the creation is audited", !!au, "a tenant.create row", au ? "recorded" : "no row"));
    }
    const page = await c.newPage();
    const problem = await signIn(page, c.baseUrl, email, password);
    if (problem) {
      checks.push(ok("the new admin can sign in with the typed password", false, "signed in", problem));
    } else {
      const v = await landOn(page, c.baseUrl, "/w");
      checks.push(ok("the first sign-in is sent to change the password", v.path === "/change-password", "/change-password", v.path));
    }
    return checks;
  },
};

const deleteAndPurge: Case = {
  id: "p2-delete-purge",
  title: "Phase 2: Delete locks the workspace out without a loop; Delete permanently leaves nothing for the platform to inherit",
  needsOwner: true,
  async run(c) {
    const owner = c.owner!;
    const s = c.signup;
    if (!s) return [ok("a workspace to delete (made by the signup case)", false, "a workspace", "the signup case made none")];
    const checks: Check[] = [];
    const runId = c.seed.runId;

    // The business, one row in each kind of table the purge has to remove by name.
    const ids = await withDbRetry(async () => {
      const fslug = `${PREFIX}s1-${runId}`;
      const a = await db().assessment.create({
        data: { slug: fslug, title: "QA tenancy purge subject", status: "PUBLISHED", publishedAt: new Date(), tenantId: s.tenantId, collectProfession: false, professionRequired: false, fireMetaCapi: false },
        select: { id: true },
      });
      const sub = await db().submission.create({ data: { assessmentId: a.id, tenantId: s.tenantId, isPreview: true }, select: { id: true } });
      const pv = await db().pageView.create({ data: { assessmentId: a.id, visitorId: `${PREFIX}${runId}`, tenantId: s.tenantId }, select: { id: true } });
      const capi = await db().capiLog.create({ data: { providerPaymentId: `pay_qatns${runId}`, eventName: "Purchase", status: "failed", response: "qa tenancy fixture, never sent", tenantId: s.tenantId }, select: { id: true } });
      const sale = await db().payment.create({ data: { providerPaymentId: `pay_qatnsale${runId}`, purpose: "assessment_unlock", status: "captured", amount: 100, tenantId: s.tenantId, assessmentId: a.id }, select: { id: true } });
      const revenue = await db().payment.create({ data: { providerPaymentId: `pay_qatnsubs${runId}`, purpose: "subscription", status: "captured", amount: 100, tenantId: s.tenantId }, select: { id: true } });
      const ai = await db().aiUsage.create({ data: { provider: "qa", model: `${PREFIX}${runId}`, tenantId: s.tenantId }, select: { id: true } });
      // "delivered", so no retry worker ever picks it up and posts it anywhere.
      const wd = await db().webhookDelivery.create({ data: { webhookId: `${PREFIX}${runId}`, eventName: "qa", endpoint: "https://example.invalid/qa", secret: "qa", body: "{}", status: "delivered", deliveredAt: new Date(), tenantId: s.tenantId }, select: { id: true } });
      return { fslug, assessment: a.id, submission: sub.id, pageView: pv.id, capi: capi.id, sale: sale.id, revenue: revenue.id, ai: ai.id, delivery: wd.id };
    });

    const tenantPage = await c.newPage();
    const problem = await signIn(tenantPage, c.baseUrl, s.email, s.password);
    if (problem) return [ok("the signup workspace's admin can sign in", false, "signed in", problem)];
    const before = await landOn(tenantPage, c.baseUrl, "/w");
    checks.push(ok("before: the admin reaches the workspace", before.path.startsWith("/w"), "/w", before.path));

    // --- the reversible delete ----------------------------------------------------
    const t0 = new Date();
    await openConsole(owner, c.baseUrl);
    await clickInRow(owner, s.slug, "Delete");
    const d = await until(() => db().tenant.findUnique({ where: { id: s.tenantId }, select: { deletedAt: true } }), (r) => !!r?.deletedAt);
    checks.push(ok("the console's Delete marks the workspace deleted", !!d?.deletedAt, "deletedAt set", d?.deletedAt ? "set" : "not set"));
    const delAudit = await lastAudit("tenant.delete", s.tenantId, t0);
    checks.push(ok("the delete is audited", !!delAudit, "a tenant.delete row", delAudit ? `by ${delAudit.actorEmail}` : "no row"));
    const during = await landOn(tenantPage, c.baseUrl, "/w");
    checks.push(ok("the deleted workspace's admin lands on /workspace-unavailable (no /w to /dashboard loop)", during.path === "/workspace-unavailable", "/workspace-unavailable", during.path));
    checks.push(ok("the page says the workspace is closed", /has been closed/i.test(during.text), "This workspace has been closed", during.text.slice(0, 120)));
    const fs = await funnelServes(c.baseUrl, ids.fslug);
    checks.push(ok("its funnel does not serve while deleted", !fs.serving, "paused or gone", fs.observed));

    // --- the permanent delete -----------------------------------------------------
    const t1 = new Date();
    await openConsole(owner, c.baseUrl);
    await clickInRow(owner, s.slug, "Delete permanently", s.slug);
    const gone = await until(() => db().tenant.findUnique({ where: { id: s.tenantId }, select: { id: true } }), (r) => r === null, 60);
    checks.push(ok("Delete permanently removes the workspace", gone === null, "no tenant row", gone ? "still there" : "gone"));

    const left = await withDbRetry(async () => ({
      assessment: await db().assessment.findUnique({ where: { id: ids.assessment }, select: { tenantId: true } }),
      submission: await db().submission.findUnique({ where: { id: ids.submission }, select: { tenantId: true } }),
      pageView: await db().pageView.findUnique({ where: { id: ids.pageView }, select: { tenantId: true } }),
      capi: await db().capiLog.findUnique({ where: { id: ids.capi }, select: { tenantId: true } }),
      sale: await db().payment.findUnique({ where: { id: ids.sale }, select: { tenantId: true } }),
      delivery: await db().webhookDelivery.findUnique({ where: { id: ids.delivery }, select: { tenantId: true } }),
      revenue: await db().payment.findUnique({ where: { id: ids.revenue }, select: { tenantId: true } }),
      ai: await db().aiUsage.findUnique({ where: { id: ids.ai }, select: { tenantId: true } }),
      login: await db().user.findFirst({ where: { email: s.email }, select: { tenantId: true } }),
      audit: await db().auditLog.findFirst({ where: { action: "tenant.purge", tenantId: s.tenantId, createdAt: { gte: t1 } }, select: { summary: true } }),
    }));
    const removed = (what: string, row: { tenantId: string | null } | null) =>
      ok(`its ${what} is deleted, not handed to the platform`, row === null, "gone", row ? `still there, tenant ${row.tenantId ?? "null (the platform)"}` : "gone");
    checks.push(removed("funnel", left.assessment), removed("lead", left.submission), removed("page view", left.pageView), removed("CAPI log", left.capi), removed("funnel sale", left.sale), removed("webhook delivery", left.delivery));
    const after = await funnelServes(c.baseUrl, ids.fslug);
    checks.push(ok("its funnel's public address no longer serves anything", !after.serving, "not served", after.observed));
    checks.push(ok("its subscription payment is KEPT (the platform's revenue ledger), unlinked", !!left.revenue && left.revenue.tenantId === null, "kept, tenant null", left.revenue ? `kept, tenant ${left.revenue.tenantId ?? "null"}` : "deleted"));
    checks.push(ok("its AI usage is KEPT (the platform's cost ledger), unlinked", !!left.ai && left.ai.tenantId === null, "kept, tenant null", left.ai ? `kept, tenant ${left.ai.tenantId ?? "null"}` : "deleted"));
    checks.push(ok("its login is KEPT, unassigned", !!left.login && left.login.tenantId === null, "kept, no workspace", left.login ? `kept, workspace ${left.login.tenantId ?? "none"}` : "deleted"));
    checks.push(ok("the purge is audited, and the row outlives the workspace", !!left.audit, "a tenant.purge row", left.audit?.summary ?? "no row"));
    return checks;
  },
};

const CASES: Case[] = [emailLink, purchaseEventId, apiTokens, razorpayWebhook, signup, overPlan, suspend, createTenant, deleteAndPurge];

/* -------------------------------------------------------------------------- */
/* The run                                                                     */
/* -------------------------------------------------------------------------- */

/** The sentence that says what went wrong. Prisma opens with a blank line and puts the reason LAST. */
function errorLine(e: unknown): string {
  const lines = (e instanceof Error ? e.message : String(e)).split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length <= 2 ? lines.join(" ") : `${lines[0]} ... ${lines[lines.length - 1]}`;
}

function verdictOf(checks: Check[]): Verdict {
  if (checks.some((c) => c.verdict === "fail")) return "fail";
  if (checks.some((c) => c.verdict === "warn")) return "warn";
  if (checks.length === 0 || checks.every((c) => c.verdict === "skip")) return "skip";
  return "pass";
}

async function run(argv: string[]): Promise<number> {
  const has = (n: string) => argv.some((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  const slow = Number(argv.find((a) => a.startsWith("--slow="))?.slice(7) ?? "0") || 0;
  const env = loadQaEnv();
  console.log(`Tenancy on ${env.baseUrl}`);

  if (has("cleanup")) {
    const removed = await cleanupTenancy();
    console.log(removed.length ? `Removed ${removed.join(", ")}.` : "Nothing to remove.");
    return 0;
  }
  if (env.looksLikeProd && !has("i-know-this-is-prod")) {
    console.log("\nRefusing to run: that host does not look like staging, and this pass suspends, deletes and purges workspaces.");
    return 1;
  }

  const runId = newRunId();
  const startedAt = new Date();
  const outDir = join(resolve(QA_ROOT, "reports"), `${startedAt.toISOString().replace(/[:.]/g, "-")}-tenancy`);
  mkdirSync(outDir, { recursive: true });
  const secret = (process.env.BETTER_AUTH_SECRET ?? "").trim();
  console.log(`Run ${runId}. Signing secret ${secret ? "present" : "absent (two signed checks will skip)"}.`);

  const seed = await seedTenancy(runId, env.emailDomain);
  console.log(`Seeded ${seed.a.slug} and ${seed.b.slug}.`);

  const browser: Browser = await chromium.launch({ headless: !has("headed"), slowMo: slow });
  const contexts: BrowserContext[] = [];
  // Every person gets their own context, so one login's cookie can never answer for another.
  const newPage = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: UA });
    contexts.push(ctx);
    return ctx.newPage();
  };
  const results: CaseResult[] = [];
  const c: Ctx = { baseUrl: env.baseUrl, seed, secret, emailDomain: env.emailDomain, owner: null, ownerProblem: null, newPage, signup: null };

  try {
    if (env.adminEmail && env.adminPassword) {
      c.owner = await newPage();
      c.ownerProblem = await signIn(c.owner, env.baseUrl, env.adminEmail, env.adminPassword);
    } else {
      c.ownerProblem = "qa/.env.qa has no QA_ADMIN_EMAIL / QA_ADMIN_PASSWORD (run npm run qa:admin)";
    }

    const only = (argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "").split(",").filter(Boolean);
    for (const k of CASES.filter((x) => only.length === 0 || only.includes(x.id))) {
      const began = Date.now();
      console.log(`\n${k.id}: ${k.title}`);
      if (k.needsOwner && (c.ownerProblem || !c.owner)) {
        results.push({ id: k.id, kind: "tenancy", title: k.title, verdict: "skip", unreachable: `the console was not opened: ${c.ownerProblem}`, checks: [], seconds: 0 });
        console.log(`  skipped: ${c.ownerProblem}`);
        continue;
      }
      let checks: Check[];
      try {
        checks = await k.run(c);
      } catch (e) {
        checks = [{ verdict: "fail", what: "running this case at all", expected: "a case that runs", observed: errorLine(e) }];
      }
      const shot = join(outDir, `${k.id}.png`);
      if (k.needsOwner && c.owner) await c.owner.screenshot({ path: shot, fullPage: false }).catch(() => {});
      for (const x of checks) {
        if (x.verdict === "pass") continue;
        console.log(`  ${x.verdict.toUpperCase()}: ${x.what}`);
        if (x.expected !== undefined) console.log(`     expected ${x.expected}`);
        if (x.observed !== undefined) console.log(`     observed ${x.observed}`);
      }
      console.log(`  ${checks.filter((x) => x.verdict === "pass").length}/${checks.length} checks passed`);
      results.push({ id: k.id, kind: "tenancy", title: k.title, verdict: verdictOf(checks), checks, ...(k.needsOwner ? { screenshotPath: shot } : {}), seconds: Math.round((Date.now() - began) / 100) / 10 });
    }
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await browser.close();
    if (has("keep")) console.log(`\nKept the ${PREFIX} workspaces (--keep). Remove them with: npm run qa:tenancy -- --cleanup`);
    else {
      const removed = await cleanupTenancy().catch((e: unknown) => [`cleanup FAILED: ${e instanceof Error ? e.message : String(e)}`]);
      console.log(`\nCleanup: ${removed.join(", ") || "nothing left"}.`);
    }
    await closeDb();
  }

  const result: SweepResult = { slug: "tenancy", baseUrl: env.baseUrl, runId, startedAt: startedAt.toISOString(), seconds: Math.round((Date.now() - startedAt.getTime()) / 100) / 10, results, outDir };
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
