import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { MARKETING } from "@/lib/marketing/content";

// Alternate headlines (H1 uses option 1):
//  2. "Turn a scorecard into a qualified pipeline."
//  3. "Score every lead against your fit criteria. Talk only to the ready ones."
export function Hero() {
  return (
    <section id="top" className="border-b">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:py-28">
        <div>
          <p className="mb-5 inline-flex items-center rounded-full border bg-[var(--muted)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Lead qualification, not just capture
          </p>

          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
            Know which leads are worth a sales call — before you make one.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--muted-foreground)]">
            Assess360 scores every prospect against your fit criteria, so your team spends
            its calls on the people who are actually ready to buy.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={MARKETING.signupHref} className={buttonVariants({ size: "lg" })}>
              Start free
            </Link>
            <a href="#how" className={buttonVariants({ variant: "outline", size: "lg" })}>
              See how scoring works
            </a>
          </div>

          <p className="mt-5 text-sm text-[var(--muted-foreground)]">
            No credit card. 25 responses a month on the free plan.
          </p>
        </div>

        <div className="rounded-2xl border bg-[var(--muted)] p-3 shadow-xl shadow-black/5">
          {/* Drop your render at public/hero-scorecard.png */}
          <img
            src={MARKETING.heroImage}
            width={720}
            height={450}
            alt="Assess360 scorecard result screen: a lead scored 78 out of 100 and marked Qualified, with dimension bars for budget fit, authority, and timeline."
            className="w-full rounded-xl"
            loading="eager"
            decoding="async"
          />
        </div>
      </div>
    </section>
  );
}
