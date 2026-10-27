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
import type { Page } from "playwright";
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
  const res = await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
  // Client-rendered panels settle after the document does. A short settle is enough:
  // nothing here waits on a network round trip to Meta, which is read from a snapshot.
  await page.waitForTimeout(1200);
  return {
    status: res?.status() ?? 0,
    url: page.url(),
    text: await page.locator("body").innerText().catch(() => ""),
    crashed: (await page.locator("[data-qa-error='boundary']").count()) > 0,
  };
}

/**
 * Did the screen answer, and is it the screen that was asked for.
 *
 * A redirect to /sign-in is reported as its own failure rather than as a missing
 * heading: it means the session died or the route is gated differently than the page
 * it sits beside, and that reads nothing like a broken screen.
 */
function arrived(v: Visit, path: string): Check[] {
  const checks: Check[] = [];
  checks.push(ok(`${path} answers`, v.status > 0 && v.status < 400, "2xx or 3xx", String(v.status)));
  checks.push(
    ok(
      `${path} is not a redirect to sign-in`,
      !v.url.includes("/sign-in"),
      path,
      new URL(v.url).pathname + new URL(v.url).search,
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

const emailProviders: ScreenGroup = {
  id: "email-providers",
  title: "The email provider dropdown, against the app's own catalog",
  needsAdmin: true,
  async run(page, baseUrl) {
    const checks: Check[] = [];
    const v = await visit(page, baseUrl, "/admin/nurture");
    checks.push(...arrived(v, "/admin/nurture"), ...datesAreIndian(v, "/admin/nurture"));
    if (v.crashed || v.url.includes("/sign-in")) return checks;

    // The one select that offers every provider, found by its CONTENTS rather than by
    // an id, so a markup change does not read as a missing provider.
    const selects = page.locator("select");
    const count = await selects.count();
    let labels: string[] = [];
    let provider = selects.first();
    for (let i = 0; i < count; i++) {
      const texts = await selects.nth(i).locator("option").allInnerTexts();
      const cleaned = texts.map((t) => t.trim());
      if (EMAIL_PROVIDER_OPTIONS.some((p) => cleaned.includes(p.label))) {
        labels = cleaned;
        provider = selects.nth(i);
        break;
      }
    }

    checks.push(
      ok(
        "the provider dropdown is on the screen",
        labels.length > 0,
        "a select listing the providers",
        `${count} select(s), none of them the provider list`,
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
    return checks;
  },
};

const whatsapp: ScreenGroup = {
  id: "whatsapp",
  title: "The WhatsApp screens, on both sides of the platform",
  needsAdmin: true,
  async run(page, baseUrl) {
    const checks: Check[] = [];
    // Both copies, because every super-admin feature belongs on the workspace side too
    // unless it is deliberately platform-only, and the two drift apart silently.
    for (const path of ["/admin/whatsapp", "/w/whatsapp"]) {
      const v = await visit(page, baseUrl, path);
      checks.push(...arrived(v, path), ...datesAreIndian(v, path));
      if (v.crashed) continue;

      // A dashboard built on somebody else's API has two honest states: a snapshot with
      // the time it was taken, or a named reason why a panel is not there. A zero where
      // Meta reported nothing is the state this must never be in.
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
    }
    return checks;
  },
};

const contacts: ScreenGroup = {
  id: "contacts",
  title: "Contacts and broadcasts, where consent is visible or it is not there",
  needsAdmin: true,
  async run(page, baseUrl) {
    const checks: Check[] = [];
    const v = await visit(page, baseUrl, "/admin/contacts");
    checks.push(...arrived(v, "/admin/contacts"), ...datesAreIndian(v, "/admin/contacts"));
    if (!v.crashed) checks.push(noRawEnums(v, "/admin/contacts"));

    const b = await visit(page, baseUrl, "/admin/broadcasts");
    checks.push(...arrived(b, "/admin/broadcasts"), ...datesAreIndian(b, "/admin/broadcasts"));
    if (!b.crashed) checks.push(noRawEnums(b, "/admin/broadcasts"));
    return checks;
  },
};

const vault: ScreenGroup = {
  id: "vault",
  title: "The vault, whose activity log is all timestamps",
  needsAdmin: true,
  async run(page, baseUrl) {
    const v = await visit(page, baseUrl, "/admin/vault");
    const checks = [...arrived(v, "/admin/vault"), ...datesAreIndian(v, "/admin/vault")];
    if (!v.crashed) {
      checks.push(
        pass(
          "the file store answered",
          `${v.text.slice(0, 80).replace(/\s+/g, " ")}...`,
        ),
      );
    }
    return checks;
  },
};

export const GROUPS: ScreenGroup[] = [legal, emailProviders, whatsapp, contacts, vault];
