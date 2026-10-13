"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin, isStaff } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";

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
}

/** Read the stored values for the editor: "" where nothing is set, so the form can
 *  show the shipped wording as a placeholder. */
export async function getCtaOfferRaw(): Promise<ActionResult<CtaOfferInput>> {
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

/**
 * Save the call to action.
 *
 * The destination is checked for SHAPE, not just trimmed. It is operator-set and never
 * request input, so it is not an open-redirect surface - but it is rendered into every
 * button on every public page, and a path missing its leading slash would resolve
 * against whatever page the button sits on, giving each page its own broken link. So a
 * path must start with "/", and a full URL must be https.
 */
export async function saveCtaOffer(input: CtaOfferInput): Promise<ActionResult> {
  const me = await requireSuperAdmin();
  if (isStaff(me)) {
    return { ok: false, error: "Only an owner can edit the landing page." };
  }

  const href = (input?.href ?? "").trim().slice(0, 500);
  if (href && !href.startsWith("/")) {
    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      return { ok: false, error: "Destination must be a path like /a/my-funnel, or a full https:// URL." };
    }
    if (parsed.protocol !== "https:") {
      return { ok: false, error: "A full URL has to be https, so no button on the site drops to http." };
    }
  }

  try {
    await prisma.appSetting.update({
      where: { id: "singleton" },
      data: {
        ctaHref: href || null,
        ctaTrialLabel: (input?.trialLabel ?? "").trim().slice(0, 60) || null,
        ctaDfyLabel: (input?.dfyLabel ?? "").trim().slice(0, 60) || null,
      },
    });
  } catch (e) {
    console.error("[platform] saveCtaOffer failed:", e instanceof Error ? e.message : String(e));
    return { ok: false, error: "Couldn't save the call to action (a temporary database error). Try again." };
  }

  // Every public page carries these buttons - the landing page, the thirteen industry
  // pages, pricing, the comparison pages, the answer pages, the calculator - and they
  // are cached independently. "layout" scope is the only thing that clears the lot;
  // naming paths one by one is how a new page ships with last month's offer on it.
  revalidatePath("/", "layout");
  revalidatePath("/platform");
  return { ok: true };
}
