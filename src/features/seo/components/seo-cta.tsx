import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { MARKETING, TRIAL_NOTE } from "@/lib/marketing/content";

/**
 * ONE call to action per page, at the end.
 *
 * Deliberately a single block rather than a CTA after every section: a page that
 * interrupts its own answer to sell is a page people stop trusting, and trust is the
 * entire asset an answer page is building. TRIAL_NOTE is shared with the pricing section
 * so the offer cannot be described two ways in two places.
 */
export function SeoCta({ heading, body }: { heading: string; body: string }) {
  return (
    <section className="mt-16 rounded-2xl border bg-[var(--muted)] p-6 sm:p-8">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{heading}</h2>
      <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">{body}</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link href={MARKETING.signupHref} className={buttonVariants({ size: "lg" })}>
          Start 14-day trial
        </Link>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
          See how Assess360 works
        </Link>
      </div>
      <p className="mt-4 text-sm text-[var(--muted-foreground)]">{TRIAL_NOTE}</p>
    </section>
  );
}
