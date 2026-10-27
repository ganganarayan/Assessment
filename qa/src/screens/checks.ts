/**
 * The owner's screens, in a real browser, for the parts of the app that are not a funnel.
 *
 * The sweep in this folder derives its cases from a published funnel. The newest work is
 * not a funnel: it is a WhatsApp dashboard reading somebody else's API, a provider
 * dropdown that decides whether mail leaves at all, a contacts table holding people who
 * consented to nothing, and two policy pages a Meta reviewer opens. None of that has a
 * respondent, so none of it can be derived - but all of it is still a screen that can be
 * blank, redirected, or confidently wrong, and the build-time verifiers in scripts/
 * cannot see a rendered page.
 *
 * So this pass is deliberately NOT a second opinion about business logic. It asserts the
 * things only a browser knows:
 *
 *   - the screen answers at all, signed in, and is not a redirect to /sign-in
 *   - the app's own error boundary did not render
 *   - every date a person reads is DD-MM-YYYY, never MM-DD-YYYY
 *   - nothing leaked through the template: no Invalid Date, no NaN, no raw enum
 *   - and, where the screen's contents ARE derivable, they match the app's own list:
 *     every email provider in the catalog is in the dropdown, in the catalog's order
 *
 * Nothing here writes. It signs in, reads, and closes.
 */
import type { Locator, Page } from "playwright";
import type { Check } from "../assert/compare.js";
import { EMAIL_PROVIDER_OPTIONS } from "../../../src/lib/email/catalog.js";
import {
  SOURCE_ADMIN,
  SOURCE_SPLIT_GATE,
  SOURCE_SUBMISSION,
  UNCONSENTED_SOURCES,
} from "../../../src/lib/contacts/sources.js";

export interface ScreenGroup {
  id: string;
  title: string;
  /** False for the pages a signed-out reviewer or crawler opens. */
  needsAdmin: boolean;
  run(page: Page, baseUrl: string): Promise<Check[]>;
}

const pass = (what: string, observed?: string): Check => ({ verdict: "pass", what, observed });
const ok = (what: string, cond: boolean, expected: string, observed: string): Check => ({
  verdict: cond ? "pass" : "fail",
  what,
  expected,
  observed,
});
const warn = (what: string, observed: string): Check => ({ verdict: "warn", what, observed });

interface Visit {
  status: number;
  url: string;
  text: string;
  crashed: boolean;
}

/** Open a screen and bring back the four things every check below is built on. */
async function visit(page: Page, baseUrl: string, path: string): Promise<Visit> {
  const res = await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  // Client-rendered panels settle after the document does, and anything this pass then
  // CLICKS - a provider dropdown, an Enter button - is dead until React has hydrated, so
  // idle is waited for rather than guessed at. The short settle stays behind it for the
  // panels that paint one frame later.
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(800);
  return {
    status: res?.status() ?? 0,
    url: page.url(),
    text: await page.locator("body").innerText().catch(() => ""),
    crashed: (await page.locator("[data-qa-error='boundary']").count()) > 0,
  };
}

/**
 * Did the screen answer, and is it THE SCREEN THAT WAS ASKED FOR.
 *
 * 🔴 The second half is the one that matters, and it was missing. This used to assert only
 * that the destination was not /sign-in, so a redirect anywhere else passed: an owner
 * session bounced from /w/settings back to the platform console scored four green checks
 * for a screen it never opened, and the group went on to assert things about the console.
 * A test that quietly examines a different page than it names is worse than no test.
 */
function arrived(v: Visit, path: string): Check[] {
  const landed = (() => {
    try {
      return new URL(v.url).pathname.replace(/\/+$/, "") || "/";
    } catch {
      return v.url;
    }
  })();
  const checks: Check[] = [];
  checks.push(ok(`${path} answers`, v.status > 0 && v.status < 400, "2xx or 3xx", String(v.status)));
  checks.push(
    ok(
      `${path} is not a redirect to sign-in`,
      !v.url.includes("/sign-in"),
      path,
      landed,
    ),
  );
  checks.push(
    ok(
      `${path} is the screen that answered`,
      landed === path.replace(/\/+$/, ""),
      path,
      landed === path.replace(/\/+$/, "") ? path : `redirected to ${landed}`,
    ),
  );
  checks.push(
    ok(`${path} renders without falling over`, !v.crashed, "the screen", "the app's error boundary"),
  );
  checks.push(
    ok(`${path} has something on it`, v.text.trim().length > 40, "a screen with content", `${v.text.trim().length} characters`),
  );
  return checks;
}


/**
 * 🔴 THE DATE RULE, checked where a person actually reads it.
 *
 * Every human-read timestamp is DD-MM-YYYY. The failure this catches is a bare
 * toLocaleString(), which renders in the SERVER's locale - and on Railway that is US
 * order, so 03-11-2026 silently becomes a different day. The test is sound rather than
 * clever: in d-d-yyyy, a SECOND component above 12 cannot be a month, so the string must
 * be month-first. Ambiguous dates are left alone instead of guessed at.
 */
function datesAreIndian(v: Visit, path: string): Check[] {
  const checks: Check[] = [];
  const found = [...v.text.matchAll(/\b(\d{1,2})-(\d{1,2})-(20\d\d)\b/g)];
  const monthFirst = found.filter((m) => Number(m[2]) > 12).map((m) => m[0]);
  checks.push(
    ok(
      `${path} shows no month-first date`,
      monthFirst.length === 0,
      "DD-MM-YYYY",
      monthFirst.length === 0 ? `${found.length} date(s), none month-first` : monthFirst.join(", "),
    ),
  );

  const iso = [...v.text.matchAll(/\b20\d\d-\d{2}-\d{2}T?\b/g)].map((m) => m[0]);
  if (iso.length > 0) {
    checks.push(
      warn(
        `${path} shows a machine timestamp to a person`,
        `${iso.slice(0, 3).join(", ")} - ISO belongs in the row and the payload, not on the screen`,
      ),
    );
  }

  const broken = ["Invalid Date", "NaN", "undefined", "[object Object]"].filter((s) => v.text.includes(s));
  checks.push(
    ok(
      `${path} leaks nothing through the template`,
      broken.length === 0,
      "no placeholder text",
      broken.join(", ") || "clean",
    ),
  );
  return checks;
}

/** A source is a database value. Seeing one on screen means a label was never written. */
function noRawEnums(v: Visit, path: string): Check {
  const raw = [
    ...UNCONSENTED_SOURCES,
    SOURCE_SUBMISSION,
    SOURCE_SPLIT_GATE,
    SOURCE_ADMIN,
  ].filter((s) => v.text.includes(s));
  return ok(
    `${path} says where somebody came from in words`,
    raw.length === 0,
    "a described source",
    raw.join(", ") || "no raw values on screen",
  );
}

/* -------------------------------------------------------------------------- */
/* The groups                                                                  */
/* -------------------------------------------------------------------------- */

const legal: ScreenGroup = {
  id: "legal",
  title: "The policy pages, as a Meta reviewer opens them: signed out, first screen",
  needsAdmin: false,
  async run(page, baseUrl) {
    const checks: Check[] = [];

    const del = await visit(page, baseUrl, "/data-deletion");
    checks.push(...arrived(del, "/data-deletion"), ...datesAreIndian(del, "/data-deletion"));
    checks.push(
      ok(
        "the deletion page names the route to ask",
        (await page.locator("a[href^='mailto:']").count()) > 0,
        "an address to write to",
        "no mailto link on the page",
      ),
    );
    checks.push(
      ok(
        "the deletion page is about deletion in its own words",
        /delet/i.test(del.text),
        "deletion instructions",
        del.text.slice(0, 80),
      ),
    );
    // An unset Settings field is not a code fault, but it IS what the reviewer would
    // read, so it is surfaced rather than passed.
    if (/\[.*set in Settings\]/i.test(del.text)) {
      checks.push(
        warn(
          "the deletion page still shows a placeholder",
          "Legal & company details are unset in Settings, so the reviewer would read '[... set in Settings]'",
        ),
      );
    }

    const privacy = await visit(page, baseUrl, "/privacy");
    checks.push(...arrived(privacy, "/privacy"), ...datesAreIndian(privacy, "/privacy"));
    checks.push(
      ok(
        "the privacy policy links to the deletion page",
        (await page.locator("a[href='/data-deletion']").count()) > 0,
        "a link a reviewer can follow",
        "no link to /data-deletion",
      ),
    );
    return checks;
  },
};

/**
 * The one select on this screen that offers every provider, found by its CONTENTS rather
 * than by an id, so a markup change does not read as a missing provider. Shared, because
 * the same dropdown has to exist on the platform's settings screen and on a tenant's.
 */
async function providerSelect(page: Page): Promise<{ labels: string[]; select: Locator }> {
  const selects = page.locator("select");
  const count = await selects.count();
  for (let i = 0; i < count; i++) {
    const cleaned = (await selects.nth(i).locator("option").allInnerTexts()).map((t) => t.trim());
    if (EMAIL_PROVIDER_OPTIONS.some((p) => cleaned.includes(p.label))) {
      return { labels: cleaned, select: selects.nth(i) };
    }
  }
  return { labels: [], select: selects.first() };
}

const emailProviders: ScreenGroup = {
  id: "email-providers",
  title: "The email provider dropdown, against the app's own catalog",
  needsAdmin: true,
  async run(page, baseUrl) {
    const checks: Check[] = [];
    const v = await visit(page, baseUrl, "/admin/settings");
    checks.push(...arrived(v, "/admin/settings"), ...datesAreIndian(v, "/admin/settings"));
    if (v.crashed || v.url.includes("/sign-in")) return checks;

    const { labels, select: provider } = await providerSelect(page);

    checks.push(
      ok(
        "the provider dropdown is on the screen",
        labels.length > 0,
        "a select listing the providers",
        `${labels.length} option(s), none of them the provider list`,
      ),
    );
    if (labels.length === 0) return checks;

    const missing = EMAIL_PROVIDER_OPTIONS.filter((p) => !labels.includes(p.label)).map((p) => p.label);
    checks.push(
      ok(
        "every provider the app can send with is offered",
        missing.length === 0,
        `${EMAIL_PROVIDER_OPTIONS.length} providers`,
        missing.length === 0 ? "all present" : `missing ${missing.join(", ")}`,
      ),
    );

    // The order IS the dropdown: HTTPS first, and the one choice Railway blocks last.
    const smtp = EMAIL_PROVIDER_OPTIONS.find((p) => p.transport === "SMTP");
    if (smtp) {
      const idx = labels.indexOf(smtp.label);
      const after = labels.slice(idx + 1).filter((l) => EMAIL_PROVIDER_OPTIONS.some((p) => p.label === l));
      checks.push(
        ok(
          "the one provider this host blocks is offered last",
          idx >= 0 && after.length === 0,
          `${smtp.label} at the bottom`,
          after.length ? `followed by ${after.join(", ")}` : `position ${idx + 1} of ${labels.length}`,
        ),
      );
    }

    /**
     * The form has to follow the choice.
     *
     * Choosing a provider is where the catalog earns its keep: the credential field is
     * labelled with that provider's OWN word for it, because being asked for an "API
     * key" by a console that calls it a Send Mail Token is how somebody pastes the
     * wrong string. And the one transport this host blocks has to say so where it is
     * chosen, not in a doc.
     *
     * Changing a dropdown is not a write: nothing is saved, and the screen is left as
     * it was found.
     */
    const https = EMAIL_PROVIDER_OPTIONS.find((p) => p.transport === "HTTPS");
    if (https) {
      await provider.selectOption({ label: https.label }).catch(() => {});
      await page.waitForTimeout(300);
      const text = await page.locator("body").innerText().catch(() => "");
      checks.push(
        ok(
          `choosing ${https.label} asks for its own credential by name`,
          text.includes(https.keyLabel),
          https.keyLabel,
          text.includes("Use TLS/SSL") ? "the SMTP fields, so the choice changed nothing" : "the credential is not named",
        ),
      );
      checks.push(
        ok(
          `choosing ${https.label} does not ask for a mail server`,
          !text.includes("Use TLS/SSL"),
          "an API key and nothing else",
          "the host, port and TLS fields are still on screen",
        ),
      );
    }

    if (smtp) {
      await provider.selectOption({ label: smtp.label }).catch(() => {});
      await page.waitForTimeout(300);
      const text = await page.locator("body").innerText().catch(() => "");
      checks.push(
        ok(
          "choosing the owner's own mail server asks for the server",
          text.includes("Use TLS/SSL"),
          "host, port, username, password",
          "the SMTP fields did not appear",
        ),
      );
      checks.push(
        ok(
          "the screen says plainly that this host blocks SMTP",
          /blocks outbound SMTP/i.test(text),
          "a warning where the choice is made",
          "nothing on screen says it will time out, so the owner will read the timeout as a wrong password",
        ),
      );
    }

    /**
     * And the same dropdown on a tenant's own settings screen.
     *
     * A workspace sends its own mail with its own credentials, so a provider only the
     * platform can choose leaves a tenant stuck on whatever the default is - and since
     * both screens are built from the same catalog, a divergence means one of them has
     * stopped reading it. Nothing is saved here either: it is read, not chosen.
     */
    checks.push(
      ...(await withTenant(page, baseUrl, async () => {
        const w = await visit(page, baseUrl, "/w/settings");
        const out = [...arrived(w, "/w/settings"), ...datesAreIndian(w, "/w/settings")];
        if (w.crashed) return out;
        const { labels: tenantLabels } = await providerSelect(page);
        const tenantMissing = EMAIL_PROVIDER_OPTIONS.filter((p) => !tenantLabels.includes(p.label)).map(
          (p) => p.label,
        );
        out.push(
          ok(
            "a tenant is offered the same providers as the platform",
            tenantLabels.length > 0 && tenantMissing.length === 0,
            `${EMAIL_PROVIDER_OPTIONS.length} providers`,
            tenantLabels.length === 0
              ? "no provider dropdown on the workspace settings screen"
              : tenantMissing.length
                ? `missing ${tenantMissing.join(", ")}`
                : "all present",
          ),
        );
        return out;
      })),
    );
    return checks;
  },
};


/**
 * Enter a tenant, which is the only way the platform owner reaches a /w screen.
 *
 * A super admin has no workspace of their own: /w resolves an ACTING tenant, and with
 * none entered it bounces back to the console. Entering is a signed cookie and nothing
 * else - no row is written, and the session is handed back at the end of the group.
 *
 * 🔴 WAIT FOR THE REDIRECT THE ACTION PERFORMS, NOT FOR THE NETWORK TO GO QUIET.
 * enterTenant() is a server action that sets the cookie and then redirects to /admin.
 * waitForLoadState("networkidle") can return the instant it is called - there is nothing
 * in flight yet - so the next navigation ABORTS the action mid-request and the cookie is
 * never written. Everything then looks like a tenant that refuses to be entered, with no
 * error anywhere. So the wait is for the destination, and the state is confirmed from the
 * product's own banner rather than assumed from a click that appeared to land.
 *
 * Returns the name of the tenant entered, or null when it could not be entered at all.
 */
async function enterFirstTenant(page: Page, baseUrl: string): Promise<string | null> {
  await page.goto(`${baseUrl}/platform`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  // The console's table is a client component, and its buttons do nothing until it has
  // hydrated - the same race that used to look like a refused password.
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  const enter = page.getByRole("button", { name: /^Enter/ }).first();
  if ((await enter.count()) === 0) return null;
  const row = enter.locator("xpath=ancestor::tr[1]");
  const name = (await row.locator("td").first().innerText().catch(() => "")).trim().split("\n")[0] ?? "";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await enter.click().catch(() => {});
    const moved = await page
      .waitForURL((u) => u.pathname === "/admin", { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (moved) break;
    // Not hydrated yet, or the click missed. Give the page a moment and ask again.
    await page.waitForTimeout(2000);
  }

  // The product says so itself when impersonation is on. Without this, a group would go on
  // to assert things about whatever page it is actually looking at.
  const banner = await page.locator("body").innerText().catch(() => "");
  return /Acting as tenant/i.test(banner) ? name || "a tenant" : null;
}


/**
 * Do the work of a group inside a tenant's workspace, and always come back out.
 *
 * Both halves matter. A /w screen is unreachable for the owner until a tenant is entered,
 * and anything run AFTER a group that entered one would silently read that tenant's data
 * instead of the platform's - green for the wrong scope, which is worse than red. The
 * exit is in a finally so a thrown selector cannot leave the rest of the pass impersonating
 * somebody.
 */
async function withTenant(
  page: Page,
  baseUrl: string,
  body: (tenant: string) => Promise<Check[]>,
): Promise<Check[]> {
  const tenant = await enterFirstTenant(page, baseUrl);
  if (!tenant) {
    return [
      warn(
        "the workspace copy was not read",
        "the platform console offered no tenant to enter, so every /w screen in this group was skipped",
      ),
    ];
  }
  try {
    return [pass("entered a tenant to read the workspace copy", tenant), ...(await body(tenant))];
  } finally {
    const exit = page.getByRole("button", { name: /Exit to platform/i }).first();
    if ((await exit.count()) > 0) {
      await exit.click().catch(() => {});
      // The same race as entering: exitTenant redirects to /platform, and waiting for the
      // network to go quiet instead would let the next navigation abort the action, leaving
      // the whole rest of the pass still impersonating.
      await page.waitForURL((u) => u.pathname === "/platform", { timeout: 20_000 }).catch(() => {});
    }
  }
}

/** The assertions that hold on either copy of the WhatsApp screen. */
async function whatsappScreen(page: Page, baseUrl: string, path: string): Promise<Check[]> {
  const checks: Check[] = [];
  const v = await visit(page, baseUrl, path);
  checks.push(...arrived(v, path), ...datesAreIndian(v, path));
  if (v.crashed) return checks;

  // A dashboard built on somebody else's API has two honest states: a snapshot with the
  // time it was taken, or a named reason why a panel is not there. A zero where Meta
  // reported nothing is the state this must never be in.
  const hasSnapshot = /as of|Refresh|Not reported/i.test(v.text);
  const hasConnect = /Connect|not connected|Connect WhatsApp/i.test(v.text);
  checks.push(
    ok(
      `${path} shows either a connection or a way to make one`,
      hasSnapshot || hasConnect,
      "a dashboard or a connect card",
      v.text.slice(0, 120).replace(/\s+/g, " "),
    ),
  );
  if (hasSnapshot) {
    checks.push(
      ok(
        `${path} says when its numbers were taken`,
        /as of/i.test(v.text) || /\b\d{2}-\d{2}-\d{4}\b/.test(v.text),
        "an 'as of' time",
        "a snapshot with no time on it, which reads as live",
      ),
    );
  }
  checks.push(
    ok(
      `${path} does not offer to register the number`,
      !/\bregister\b/i.test(v.text),
      "no register button",
      "the word 'register' is on a coexistence screen, and registering takes the number off the owner's phone",
    ),
  );
  return checks;
}

const whatsapp: ScreenGroup = {
  id: "whatsapp",
  title: "The WhatsApp screens, on both sides of the platform",
  needsAdmin: true,
  async run(page, baseUrl) {
    // Both copies, because every super-admin feature belongs on the workspace side too
    // unless it is deliberately platform-only, and the two drift apart silently.
    return [
      ...(await whatsappScreen(page, baseUrl, "/admin/whatsapp")),
      ...(await withTenant(page, baseUrl, () => whatsappScreen(page, baseUrl, "/w/whatsapp"))),
    ];
  },
};


/** The assertions that hold on either copy of the contacts screens. */
async function contactScreen(page: Page, baseUrl: string, path: string): Promise<Check[]> {
  const v = await visit(page, baseUrl, path);
  const checks = [...arrived(v, path), ...datesAreIndian(v, path)];
  if (!v.crashed) checks.push(noRawEnums(v, path));
  return checks;
}

const contacts: ScreenGroup = {
  id: "contacts",
  title: "Contacts and broadcasts, where consent is visible or it is not there",
  needsAdmin: true,
  async run(page, baseUrl) {
    return [
      ...(await contactScreen(page, baseUrl, "/admin/contacts")),
      ...(await contactScreen(page, baseUrl, "/admin/broadcasts")),
      // The workspace copies. A tenant's contacts are the people who answered THEIR
      // funnels, so the consent wording and the described source have to survive on this
      // side too - and this is the side a customer actually looks at.
      ...(await withTenant(page, baseUrl, async () => [
        ...(await contactScreen(page, baseUrl, "/w/contacts")),
        ...(await contactScreen(page, baseUrl, "/w/broadcasts")),
      ])),
    ];
  },
};


const vault: ScreenGroup = {
  id: "vault",
  title: "The vault, and the fact that a workspace cannot reach it",
  needsAdmin: true,
  async run(page, baseUrl) {
    const v = await visit(page, baseUrl, "/admin/vault");
    const checks = [...arrived(v, "/admin/vault"), ...datesAreIndian(v, "/admin/vault")];
    if (!v.crashed) {
      checks.push(pass("the file store answered", `${v.text.slice(0, 80).replace(/\s+/g, " ")}...`));
    }

    /**
     * 🔴 THE VAULT IS PLATFORM-ONLY, AND THIS IS WHERE THAT EITHER HOLDS OR DOES NOT.
     *
     * There is no /w/vault page, by decision: the vault browses the platform's own R2
     * bucket, which holds every tenant's files. So the parity question here is not whether
     * the workspace copy looks right - it is whether the route can be reached from inside a
     * workspace at all. A tenant who could open it would be reading other businesses'
     * uploads, which is the worst thing in this pass, and it is one route file away at any
     * time. Checked from an entered tenant, which is as close to a tenant's own session as
     * this pass can honestly get.
     */
    checks.push(
      ...(await withTenant(page, baseUrl, async () => {
        const w = await visit(page, baseUrl, "/w/vault");
        const looksLikeTheVault = /\bvault\b|bucket|object key|upload/i.test(w.text);
        const reachable = w.status < 400 && looksLikeTheVault;
        return [
          ok(
            "the platform file store is not reachable from a workspace",
            !reachable,
            "no workspace copy of the vault",
            reachable
              ? `/w/vault answered ${w.status} with a file browser on it`
              : `/w/vault offers nothing (status ${w.status})`,
          ),
          ok(
            "/w/vault does not fall over on its way to saying no",
            !w.crashed,
            "a not-found page or a redirect",
            "the app's error boundary, so the refusal is a crash",
          ),
        ];
      })),
    );
    return checks;
  },
};


export const GROUPS: ScreenGroup[] = [legal, emailProviders, whatsapp, contacts, vault];
