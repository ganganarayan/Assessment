import Link from "next/link";
import type { ResolvedPlan } from "@/lib/billing/entitlements";
import { TRIAL_DAYS, PLAN_LABEL, TRIAL_PLAN } from "@/lib/billing/plans";

/**
 * The workspace-wide billing state strip: trial countdown, parked notice, or a
 * past-due warning. Mounted once in the /w layout, so every workspace page carries it.
 *
 * Why this exists: `resolvePlan` has always computed `trialing` and `parked`, and
 * nothing rendered either. A tenant therefore discovered their trial had ended by
 * hitting a limit error - the exact silent feature loss that parking (rather than
 * downgrading) was chosen to avoid. Parking only keeps that promise if the tenant is
 * TOLD, so this is part of the enforcement, not decoration.
 *
 * Server component with no state: the strip must be correct on first paint, and a
 * client fetch would flash the wrong thing (or nothing) on an ad-funnel-adjacent page.
 */

interface Notice {
  /** Severity, in the project's dot convention: amber = attention, red = blocked. */
  tone: "neutral" | "warn" | "blocked";
  headline: string;
  detail: string;
  /** The primary button's label, or null when there is nothing for this reader to do. */
  cta: string | null;
  /** Where the primary button goes. Defaults to the billing page. */
  href?: string;
  /** An optional second, quieter link. The trial needs one: "what you get" and "help
   *  me use it" are different asks, and collapsing them into one button means whichever
   *  the tenant needed, they got the other. */
  secondary?: { label: string; href: string };
}

/**
 * The notice a resolved plan deserves, or null when there is nothing to say.
 * Deliberately NOT exported: the billing page writes its own, longer header sentence
 * from the same resolved state, and a second caller of this would be two ways to say
 * one thing - which is how `parkedDenied()` became dead code.
 */
/** When the response meter starts being worth saying out loud. */
const WARN_AT = 0.8;

function billingNotice(
  resolved: ResolvedPlan,
  usage: { used: number; limit: number } | null,
): Notice | null {
  // The platform and internal-unlimited tenants are not rated against the catalog, so
  // there is no trial to count down and nothing to park. Checked first: both carry
  // plan: null, which every other branch here would misread as "no plan".
  if (resolved.isPlatform || resolved.unlimited) return null;

  // AN AGENCY TENANT HAS NO PLAN OF ITS OWN, so neither of the two notices below fits
  // it: the parked one would send a client to a billing page they must not act on (the
  // agency is the customer), and the trial countdown would tell them a trial they never
  // started is running out. The only honest version is who to ask.
  if (resolved.agencyTenant) {
    if (!resolved.parked) return null;
    return {
      tone: "blocked",
      headline: "This workspace is paused",
      detail:
        "It is managed by the agency that set it up, and their plan has lapsed. Nothing has been deleted - every lead and setting is exactly where it was. Ask them to restore it.",
      cta: null,
    };
  }

  if (resolved.parked) {
    return {
      tone: "blocked",
      headline: "Workspace paused",
      detail:
        "Your funnel is not accepting new responses. Every submission, export and report you already have is untouched - pick a plan and it resumes immediately.",
      cta: "Choose a plan",
    };
  }

  if (resolved.trialing) {
    const d = resolved.trialDaysLeft;
    const days = `${d} day${d === 1 ? "" : "s"}`;
    // Which day of the window they are on. A bare "11 days left" is a number people
    // learn to ignore; "Day 3 of 14" is a position in something that is visibly
    // running out, and it is the same fact.
    const day = Math.min(TRIAL_DAYS, Math.max(1, TRIAL_DAYS - d + 1));
    return {
      // Under four days the countdown stops being informational and becomes something
      // to act on, so it changes colour rather than relying on the tenant reading a
      // number they have already learned to ignore.
      tone: d <= 3 ? "warn" : "neutral",
      headline: `Day ${day} of ${TRIAL_DAYS} - ${PLAN_LABEL[TRIAL_PLAN]} trial, ${days} left`,
      // What they have, what to DO with it, and who will help - in that order.
      //
      // The old copy explained what happens when the trial ENDS, which is accurate and
      // useless on day three: it gives somebody who has not built anything yet nothing
      // to do today. A trial is lost in the first week, not the last, and the thing
      // that converts a workspace is one real qualified lead - so the banner names that
      // as the target and names the deadline it has to happen inside.
      detail:
        `Every ${PLAN_LABEL[TRIAL_PLAN]} feature is switched on, no card needed. Speed wins: aim to land your first qualified, paying client before day ${TRIAL_DAYS} - that is what this window is for, and the workspaces that get there are the ones that publish a funnel in week one. Check Billing for everything included, and ask support to set it up with you.`,
      cta: "See what's included",
      secondary: { label: "Get setup help", href: "/contact" },
    };
  }

  /**
   * The response cap, approaching and passed.
   *
   * 🔴 WHY THIS IS NOT DECORATION. The public FAQ says, in these words, "You'll get a
   * heads-up as you approach the limit" - and nothing in the app did. `getUsage` had
   * zero callers, so a paying tenant could not see their count anywhere, hit the cap
   * mid-campaign, and have new results held back with no notice at all. The first
   * person to find out was a respondent seeing a withheld result.
   *
   * Over the cap is louder than approaching it, and both say the number: a warning that
   * does not say how close you are is a warning people learn to scroll past.
   */
  if (usage) {
    const { used, limit } = usage;
    if (used >= limit) {
      return {
        tone: "blocked",
        headline: `Response limit reached - ${used.toLocaleString()} of ${limit.toLocaleString()}`,
        detail:
          "Answers are still being captured, and nothing is lost. New results are held back until you raise the plan, and raising it unlocks every held lead immediately - including the ones captured while you decide.",
        cta: "Raise the limit",
      };
    }
    if (used / limit >= WARN_AT) {
      return {
        tone: "warn",
        headline: `${(limit - used).toLocaleString()} qualified responses left this period`,
        detail: `You have used ${used.toLocaleString()} of ${limit.toLocaleString()}. Past the cap answers are still captured, but new results are held until the plan goes up - so this is the moment to decide, not after a campaign lands.`,
        cta: "See plans",
      };
    }
  }

  if (resolved.status === "PAST_DUE") {
    return {
      tone: "warn",
      headline: "Payment failed",
      detail:
        "Your plan is still active while we retry. If the retries fail the workspace pauses - no data is lost, but the funnel stops accepting responses.",
      cta: "Update payment",
    };
  }

  return null;
}

const TONE: Record<Notice["tone"], string> = {
  neutral: "border-[var(--border)] bg-[var(--muted)]",
  warn: "border-amber-500/40 bg-amber-500/10",
  blocked: "border-red-500/40 bg-red-500/10",
};

/** The strip itself. Renders nothing when there is no notice - the common case. */
export function BillingBanner({
  resolved,
  usage = null,
}: {
  resolved: ResolvedPlan;
  /** Response count vs cap, or null when there is nothing to meter. */
  usage?: { used: number; limit: number } | null;
}) {
  const notice = billingNotice(resolved, usage);
  if (!notice) return null;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-sm ${TONE[notice.tone]}`}>
      <span className="min-w-0">
        <strong>{notice.headline}</strong>{" "}
        <span className="text-[var(--muted-foreground)]">{notice.detail}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {notice.secondary ? (
          <Link
            href={notice.secondary.href}
            className="text-xs font-medium underline underline-offset-2 hover:no-underline"
          >
            {notice.secondary.label}
          </Link>
        ) : null}
        {/* A plain <a>, not <Link>, for the same reason as the locked panel's button:
            this banner is rendered by the /w layout, and a client navigation does not
            re-render a layout, so clicking through to billing left a parked workspace
            parked on screen. See workspace-locked.tsx. */}
        {notice.cta ? (
          <a
            href={notice.href ?? "/w/billing"}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-xs font-medium hover:bg-[var(--muted)]"
          >
            {notice.cta}
          </a>
        ) : null}
      </span>
    </div>
  );
}
