import Link from "next/link";
import type { ResolvedPlan } from "@/lib/billing/entitlements";

/**
 * The workspace-wide billing state strip: trial countdown, parked notice, or a
 * past-due warning. Mounted once in the /w layout, so every workspace page carries it.
 *
 * Why this exists: `resolvePlan` has always computed `trialing` and `parked`, and
 * nothing rendered either. A tenant therefore discovered their trial had ended by
 * hitting a limit error — the exact silent feature loss that parking (rather than
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
  cta: string;
}

/**
 * The notice a resolved plan deserves, or null when there is nothing to say.
 * Deliberately NOT exported: the billing page writes its own, longer header sentence
 * from the same resolved state, and a second caller of this would be two ways to say
 * one thing — which is how `parkedDenied()` became dead code.
 */
function billingNotice(resolved: ResolvedPlan): Notice | null {
  // The platform and internal-unlimited tenants are not rated against the catalog, so
  // there is no trial to count down and nothing to park. Checked first: both carry
  // plan: null, which every other branch here would misread as "no plan".
  if (resolved.isPlatform || resolved.unlimited) return null;

  if (resolved.parked) {
    return {
      tone: "blocked",
      headline: "Workspace paused",
      detail:
        "Your funnel is not accepting new responses. Every submission, export and report you already have is untouched — pick a plan and it resumes immediately.",
      cta: "Choose a plan",
    };
  }

  if (resolved.trialing) {
    const d = resolved.trialDaysLeft;
    const days = `${d} day${d === 1 ? "" : "s"}`;
    return {
      // Under four days the countdown stops being informational and becomes something
      // to act on, so it changes colour rather than relying on the tenant reading a
      // number they have already learned to ignore.
      tone: d <= 3 ? "warn" : "neutral",
      headline: `Trial — ${days} left`,
      detail:
        "Full Signal features, no card. When the trial ends the workspace pauses rather than dropping a tier: nothing is deleted and nothing silently stops working.",
      cta: "Choose a plan",
    };
  }

  if (resolved.status === "PAST_DUE") {
    return {
      tone: "warn",
      headline: "Payment failed",
      detail:
        "Your plan is still active while we retry. If the retries fail the workspace pauses — no data is lost, but the funnel stops accepting responses.",
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

/** The strip itself. Renders nothing when there is no notice — the common case. */
export function BillingBanner({ resolved }: { resolved: ResolvedPlan }) {
  const notice = billingNotice(resolved);
  if (!notice) return null;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-sm ${TONE[notice.tone]}`}>
      <span className="min-w-0">
        <strong>{notice.headline}</strong>{" "}
        <span className="text-[var(--muted-foreground)]">{notice.detail}</span>
      </span>
      <Link
        href="/w/billing"
        className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-xs font-medium hover:bg-[var(--muted)]"
      >
        {notice.cta}
      </Link>
    </div>
  );
}
