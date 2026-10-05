import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/**
 * The paused workspace.
 *
 * A trial that ends, or a subscription that lapses, PARKS the workspace: the account
 * still signs in, the data is still there, and nothing is deleted. What stops is the
 * use of it. Picking a plan resumes everything exactly where it left off.
 *
 * Two things stay open behind the lock, deliberately:
 *
 *   Billing, because it is the page that ends the lock, and locking someone out of
 *   the way to pay is self-defeating.
 *
 *   Export, because the records are the customer's, not ours. Holding a business's
 *   own leads hostage to a renewal is the kind of thing that turns a lapsed trial
 *   into a chargeback, and it costs nothing to allow.
 *
 * The blurred page behind this panel is the workspace they had. It is shown rather
 * than hidden on purpose: "your data is still here" is more persuasive when they can
 * see it than when they are told it.
 */
export function WorkspaceLocked({ supportEmail }: { supportEmail?: string | null }) {
  return (
    <div className="relative min-h-[70vh]">
      {/* The decorative "workspace behind glass". Pure presentation: the real pages
          are never rendered while parked, so nothing here can be read by removing a
          CSS class. */}
      <div aria-hidden className="pointer-events-none select-none blur-sm" >
        <div className="flex flex-col gap-4 opacity-40">
          <div className="h-8 w-56 rounded bg-[var(--muted)]" />
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 rounded-lg border bg-[var(--muted)]" />
            ))}
          </div>
          <div className="h-64 rounded-lg border bg-[var(--muted)]" />
        </div>
      </div>

      <div className="absolute inset-0 flex items-start justify-center p-4 pt-10">
        <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-lg">
          <h1 className="text-xl font-bold tracking-tight">This workspace is paused</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Your trial has ended. Nothing has been deleted: every assessment, lead and setting
            is exactly where you left it, and picking a plan brings all of it straight back.
          </p>
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            While it is paused, your funnels stop accepting new responses and the workspace is
            closed. You can still download your data.
          </p>

          <div className="mt-5 flex flex-col gap-2">
            <Link href="/w/billing" className={buttonVariants({ className: "w-full" })}>
              Choose a plan
            </Link>
            <a
              href="/api/w/submissions/export?format=csv"
              className={buttonVariants({ variant: "outline", className: "w-full" })}
            >
              Download my data (CSV)
            </a>
          </div>

          {supportEmail ? (
            <p className="mt-4 text-center text-xs text-[var(--muted-foreground)]">
              Questions?{" "}
              <a href={`mailto:${supportEmail}`} className="underline">
                {supportEmail}
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
