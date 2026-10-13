"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin, isStaff } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { absoluteCtaUrl, repairCtaHref, repairSentence } from "@/lib/marketing/cta-link";
import { effectiveHost } from "@/lib/tenant/forwarded-host";

/**
 * The ONE call to action - PLATFORM ONLY, for the same reason the landing videos are:
 * the marketing site is the SaaS shopfront, not something a tenant owns or edits. It
 * lives on /platform rather than /admin/settings because /admin is the impersonation
 * surface, and a platform-only setting sitting there is exactly the ambiguity the
 * tenancy work has been removing.
 *
 * Three values on the singleton AppSetting row: where every public button goes, and
 * the two labels those buttons carry. They were constants in content.ts, which made
 * changing the offer a code edit and a deploy - and an offer that costs a deploy to
 * change is an offer that drifts away from what is actually being sold.
 *
 * Blank is a valid answer everywhere and means "use the shipped wording" (see
 * resolveCta in lib/settings/config.ts). That is what makes these fields safe to
 * clear: emptying the destination restores the default rather than publishing forty
 * buttons that go nowhere.
 */

export interface CtaOfferInput {
  /** A path on this app, or an absolute https URL. Blank = the constant. */
  href: string;
  /** Trial framing: nav, hero secondary, the priced tiers, the answer pages. */
  trialLabel: string;
  /** Free-build framing: hero primary, metering, the offer blocks, the calculator. */
  dfyLabel: string;
  /**
   * Save a link the check could not confirm. Only offered when the page could not be
   * REACHED (a timeout, DNS, a network error) - never for a page that answered 404,
   * because that answer is the site telling us the link is wrong.
   */
  force?: boolean;
}

export type CtaSaveResult =
  | {
      ok: true;
      /** What was stored, after repair. Blank means "using the shipped default". */
      href: string;
      /** The absolute URL that was fetched, for the "open it" button. */
      checkedUrl: string | null;
      /** The sentence describing any repair, so the owner sees what changed. */
      repaired: string | null;
      /** True when the save went through without the link being confirmed. */
      unverified: boolean;
    }
  | {
      ok: false;
      error: string;
      /** The repaired candidate, so the field can show the better version. */
      href?: string;
      repaired?: string | null;
      /** True when "Save anyway" is a reasonable offer. */
      canForce?: boolean;
    };

/** Read the stored values for the editor: "" where nothing is set, so the form can
 *  show the shipped wording as a placeholder. */
export async function getCtaOfferRaw(): Promise<ActionResult<Omit<CtaOfferInput, "force">>> {
  await requireSuperAdmin();
  try {
    const row = await prisma.appSetting.findUnique({
      where: { id: "singleton" },
      select: { ctaHref: true, ctaTrialLabel: true, ctaDfyLabel: true },
    });
    return {
      ok: true,
      data: {
        href: row?.ctaHref?.trim() ?? "",
        trialLabel: row?.ctaTrialLabel?.trim() ?? "",
        dfyLabel: row?.ctaDfyLabel?.trim() ?? "",
      },
    };
  } catch (e) {
    console.error("[platform] getCtaOfferRaw failed:", e instanceof Error ? e.message : String(e));
    return { ok: false, error: "Couldn't load the call to action (a temporary database error)." };
  }
}

/** The site's own origin, so a stored PATH can be checked the way a visitor meets it. */
async function ownOrigin(): Promise<string> {
  const h = await headers();
  const host = effectiveHost(h);
  const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${proto}://${host}`;
}

/**
 * Does the link actually load?
 *
 * GET rather than HEAD: a Next route handler is free not to implement HEAD, and a 405
 * from our own app would read as a broken funnel. `redirect: "follow"` on purpose - a
 * destination that redirects (a tenant domain, a trailing-slash rewrite) is working,
 * and what matters is where the visitor lands.
 *
 * Eight seconds. Long enough for a cold Railway container to answer, short enough that
 * a save still feels like a save.
 */
async function linkLoads(
  url: string,
): Promise<{ ok: true; status: number } | { ok: false; status: number | null; reason: string }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "Assess360-LinkCheck/1.0" },
    });
    if (res.status >= 400) return { ok: false, status: res.status, reason: `answered ${res.status}` };
    return { ok: true, status: res.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: null,
      reason: /timeout|aborted/i.test(msg) ? "did not answer in time" : "could not be reached",
    };
  }
}

/**
 * Save the call to action, but only once the destination has been proved to load.
 *
 * The order is repair, then check, then store. A shape check alone was not enough: the
 * old version accepted "https//assess360..." as a full URL and stored it, and every
 * button on the site then pointed at a relative path called "https//assess360..."
 * which 404s. The funnel would have gone quiet with nothing on any page looking wrong.
 */
export async function saveCtaOffer(input: CtaOfferInput): Promise<CtaSaveResult> {
  const me = await requireSuperAdmin();
  if (isStaff(me)) {
    return { ok: false, error: "Only an owner can edit the landing page." };
  }

  const trialLabel = (input?.trialLabel ?? "").trim().slice(0, 60) || null;
  const dfyLabel = (input?.dfyLabel ?? "").trim().slice(0, 60) || null;

  const fixed = repairCtaHref((input?.href ?? "").slice(0, 500));
  const repaired = repairSentence(fixed.notes);

  // Blank is a deliberate answer: it puts the shipped default back. Nothing to check.
  if (!fixed.value) {
    return (await write(null, trialLabel, dfyLabel))
      ? { ok: true, href: "", checkedUrl: null, repaired: null, unverified: false }
      : { ok: false, error: "Couldn't save (a temporary database error). Try again." };
  }

  if (!fixed.valid) {
    return {
      ok: false,
      error:
        "That is not a link this can use. Give a path on this site, like /a/my-funnel, or a full https:// address.",
      href: fixed.value,
      repaired,
    };
  }

  const url = absoluteCtaUrl(fixed.value, await ownOrigin());
  if (!url) {
    return {
      ok: false,
      error: "That link cannot be resolved into an address. Check the domain and try again.",
      href: fixed.value,
      repaired,
    };
  }

  const check = input?.force ? null : await linkLoads(url);
  if (check && !check.ok) {
    const lead = repaired ? `${repaired} It still does not work: ` : "That page link does not work: ";
    // A 4xx/5xx is the site answering "this is not here", so there is nothing to
    // override. Unreachable is different - it can be a cold start or a DNS blip, and
    // refusing the save outright would leave the owner stuck.
    const canForce = check.status === null;
    return {
      ok: false,
      error:
        `${lead}${url} ${check.reason}.` +
        (canForce
          ? " Fix it, or save it anyway if you are sure the address is right."
          : " Check the slug, and that the funnel is published."),
      href: fixed.value,
      repaired,
      canForce,
    };
  }

  if (!(await write(fixed.value, trialLabel, dfyLabel))) {
    return { ok: false, error: "Couldn't save the call to action (a temporary database error). Try again." };
  }

  return {
    ok: true,
    href: fixed.value,
    checkedUrl: url,
    repaired,
    unverified: Boolean(input?.force),
  };
}

/** The write itself, plus the revalidation. Returns false on a database error. */
async function write(
  ctaHref: string | null,
  ctaTrialLabel: string | null,
  ctaDfyLabel: string | null,
): Promise<boolean> {
  try {
    await prisma.appSetting.update({
      where: { id: "singleton" },
      data: { ctaHref, ctaTrialLabel, ctaDfyLabel },
    });
  } catch (e) {
    console.error("[platform] saveCtaOffer failed:", e instanceof Error ? e.message : String(e));
    return false;
  }

  // Every public page carries these buttons - the landing page, the thirteen industry
  // pages, pricing, the comparison pages, the answer pages, the calculator - and they
  // are cached independently. "layout" scope is the only thing that clears the lot;
  // naming paths one by one is how a new page ships with last month's offer on it.
  revalidatePath("/", "layout");
  revalidatePath("/platform");
  return true;
}
