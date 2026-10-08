import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { MARKETING, TRIAL_NOTE, HERO, DFY } from "@/lib/marketing/content";
import { VideoEmbed } from "./VideoEmbed";

// The hero now carries the MECHANISM rather than the benefit. "Know which leads are
// worth a sales call" is a promise every competitor also makes, and the thing none of
// them can make - the exclusion signal that retrains the ad account - was sitting at
// capability eleven. Copy lives in HERO so the page and the ads cannot drift apart.
//
// Alternate headlines kept, in case the mechanism line tests worse:
//  1. "Know which leads are worth a sales call - before you make one."  (previous H1)
//  2. "Turn a scorecard into a qualified pipeline."
//  3. "Score every lead against your fit criteria. Talk only to the ready ones."
export function Hero({ video }: { video?: string | null }) {
  return (
    <section id="top" className="border-b">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:py-28">
        <div>
          <p className="mb-5 inline-flex items-center rounded-full border bg-[var(--muted)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            {HERO.eyebrow}
          </p>

          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
            {HERO.headline}
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--muted-foreground)]">
            {HERO.sub}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {/* The done-for-you build is the primary action, not the trial. Someone who
                has just read that their ad account is buying the wrong people wants it
                fixed, not a fourteen-day homework assignment. The trial stays one click
                away for the people who would rather drive themselves. */}
            <Link href={DFY.href} className={buttonVariants({ size: "lg" })}>
              {HERO.primaryCta}
            </Link>
            <Link
              href={MARKETING.signupHref}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              {HERO.secondaryCta}
            </Link>
          </div>

          {/* Was "No credit card. 25 responses a month on the free plan." - copy that
              outlived the plan it described. There is no free tier; TRIAL_NOTE is the one
              sentence the pricing section also renders, so the claim cannot drift again. */}
          <p className="mt-5 text-sm text-[var(--muted-foreground)]">{TRIAL_NOTE}</p>
        </div>

        <div className="rounded-2xl border bg-[var(--muted)] p-3 shadow-xl shadow-black/5">
          {/* The video is the preferred hero when one is set; the image is the fallback
              and stays the default, so the section never renders empty. */}
          {video ? (
            <VideoEmbed src={video} title="Assess360 - how lead qualification works" />
          ) : (
          /* Drop your render at public/hero-scorecard.png */
          <img
            src={MARKETING.heroImage}
            width={720}
            height={450}
            alt="Assess360 scorecard result screen: a lead scored 78 out of 100 and marked Qualified, with dimension bars for budget fit, authority, and timeline."
            className="w-full rounded-xl"
            loading="eager"
            decoding="async"
          />
          )}
        </div>
      </div>
    </section>
  );
}
