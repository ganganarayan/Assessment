import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { TRIAL_DAYS, PLAN_LABEL, TRIAL_PLAN } from "@/lib/billing/plans";
import type { ResolvedPlan } from "@/lib/billing/entitlements";

/**
 * The trial panel on the workspace dashboard.
 *
 * The thin strip in the /w layout carries this message on every screen; this is the
 * version for the screen they LAND on, where there is room to say what the fourteen
 * days are actually for.
 *
 * It states a target rather than a countdown. "11 days left" tells somebody their
 * window is closing and nothing about what to do with it; "land your first qualified,
 * paying client before day 14" is a thing that can be worked on this afternoon. A
 * trial is lost in the first week - by a workspace that never published a funnel - and
 * not in the last, so the panel pushes at the start and raises its voice at the end.
 *
 * Renders nothing outside a trial. The platform and internal tenants are not rated
 * against the catalog at all, and both carry plan: null, which is why they are checked
 * before anything else here.
 */
export function TrialFocus({ resolved }: { resolved: ResolvedPlan }) {
  if (resolved.isPlatform || resolved.unlimited) return null;
  if (!resolved.trialing) return null;

  const left = resolved.trialDaysLeft;
  const day = Math.min(TRIAL_DAYS, Math.max(1, TRIAL_DAYS - left + 1));
  const pct = Math.round((day / TRIAL_DAYS) * 100);
  const urgent = left <= 3;

  return (
    <Card className={urgent ? "border-amber-500/50" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-lg">
            Day {day} of {TRIAL_DAYS} - your {PLAN_LABEL[TRIAL_PLAN]} trial
          </CardTitle>
          <span className={urgent ? "text-sm font-semibold text-amber-600" : "text-sm text-[var(--muted-foreground)]"}>
            {left} day{left === 1 ? "" : "s"} left
          </span>
        </div>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Every {PLAN_LABEL[TRIAL_PLAN]} feature is switched on, no card needed.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* The window, drawn. A number people read past; a bar that is visibly most of
            the way across is harder to ignore. */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
          <div
            className={urgent ? "h-full rounded-full bg-amber-500" : "h-full rounded-full bg-green-600"}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div>
          <p className="text-sm font-medium">
            The target: one qualified, paying client before day {TRIAL_DAYS}.
          </p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Speed wins. The workspaces that convert are the ones that publish a funnel in the first week and
            send traffic at it - not the ones that spend fourteen days perfecting the questions. Build it
            rough, put it in front of real people, and fix it from what they answer.
          </p>
        </div>

        <ol className="flex flex-col gap-2 text-sm">
          {[
            "Import a template below and edit it - it is faster than starting from an empty builder.",
            "Add your Meta pixel and CAPI token in Settings, then publish.",
            "Send real traffic at it today, even a little. One qualified lead tells you more than a week of editing.",
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-green-600 text-[11px] font-semibold text-white"
              >
                {i + 1}
              </span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-3">
          <Link href="/w/billing" className={buttonVariants({ size: "sm", variant: "outline" })}>
            See what {PLAN_LABEL[TRIAL_PLAN]} includes
          </Link>
          <Link href="/contact" className="text-sm font-medium underline underline-offset-2 hover:no-underline">
            Support will set it up with you
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
