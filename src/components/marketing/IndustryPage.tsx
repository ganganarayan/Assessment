import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { Tick } from "./Emphasised";
import { IndustryLeak } from "./IndustryLeak";
import { OFFER, TRIAL_NOTE } from "@/lib/marketing/content";
import { INDUSTRY_CTA, INDUSTRY_EYEBROW, type IndustrySpec } from "@/lib/marketing/industries";

/**
 * One renderer for every By-industry page.
 *
 * Deliberately not a new template. The chrome is Nav and Footer, the announcement
 * bar arrives inside Nav with the live slot count already in it, and the section
 * rhythm (max-w-6xl, px-5 sm:px-8, py-20, a bottom border) is the home page's own.
 * A visitor should not be able to tell these pages were written separately.
 *
 * The page body carries ONE primary action, and it is the same action the landing
 * page leads with, read from INDUSTRY_CTA. No second ask, no form of its own, no
 * pricing table: a reader who has just been shown what their enquiry flow costs
 * should have exactly one thing to click.
 */
export function IndustryPage({ spec }: { spec: IndustrySpec }) {
  return (
    <>
      <Nav anchorBase="/" />
      <main id="main">
        {/* ---- Hero ------------------------------------------------------- */}
        <section id="top" className="border-b">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <p className="mb-5 inline-flex items-center rounded-full border bg-[var(--muted)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              {INDUSTRY_EYEBROW}
            </p>

            <h1 className="max-w-3xl text-3xl font-bold leading-[1.12] tracking-tight sm:text-5xl">
              {spec.hero.headline}
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--muted-foreground)]">
              {spec.hero.sub}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={INDUSTRY_CTA.primaryHref} className={buttonVariants({ size: "lg" })}>
                {INDUSTRY_CTA.primaryLabel}
              </Link>
              <Link
                href={INDUSTRY_CTA.secondaryHref}
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                {INDUSTRY_CTA.secondaryLabel}
              </Link>
            </div>

            <p className="mt-5 text-sm font-medium">{OFFER.ctaSubline}</p>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">{TRIAL_NOTE}</p>
          </div>
        </section>

        {/* ---- The emailed audit ------------------------------------------
            Most people here were sent a one-page audit of their own funnel and
            clicked through from it. Acknowledging that costs four lines and
            stops the page reading like a cold pitch to somebody holding a
            report with their own numbers in it. The second paragraph is for
            everyone who arrived cold, so neither reader feels addressed by
            copy written for the other. */}
        <section className="border-b bg-[var(--muted)]">
          <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-14">
            <div className="max-w-2xl">
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{spec.inbox.heading}</h2>
              <p className="mt-4 leading-relaxed text-[var(--muted-foreground)]">{spec.inbox.body}</p>
              <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">{spec.inbox.cold}</p>
            </div>
          </div>
        </section>

        {/* ---- The leak, with its arithmetic ------------------------------ */}
        <section id="leak" className="scroll-mt-20 border-b">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{spec.leak.heading}</h2>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[var(--muted-foreground)]">
              {spec.leak.lead}
            </p>

            <div className="mt-10 max-w-3xl">
              <IndustryLeak spec={spec.leak} />
            </div>

            <div className="mt-14 max-w-3xl border-t pt-10">
              <h3 className="text-xl font-bold tracking-tight sm:text-2xl">
                {spec.leak.caughtHeading}
              </h3>
              <ul className="mt-6 flex flex-col gap-4">
                {spec.leak.caught.map((c) => (
                  <li key={c.title} className="flex gap-3">
                    <Tick />
                    <p className="leading-relaxed text-[var(--muted-foreground)]">
                      <strong className="font-semibold text-[var(--foreground)]">{c.title}</strong>{" "}
                      {c.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---- What we found across the category --------------------------
            An observation, labelled as one, with the method named and the check
            handed to the reader. The claim is strong enough that stating it as
            research we did not do would be the one thing on the page a
            competitor could take apart. */}
        <section className="border-b">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {spec.research.heading}
            </h2>
            <div className="mt-8 max-w-3xl rounded-xl border-l-4 border-green-600 bg-[var(--muted)] p-6 sm:p-8">
              <p className="text-lg font-medium leading-relaxed sm:text-xl">{spec.research.claim}</p>
            </div>
            <p className="mt-6 max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
              {spec.research.method}
            </p>
            <p className="mt-5 max-w-2xl leading-relaxed">{spec.research.soWhat}</p>
          </div>
        </section>

        {/* ---- Gate, Score, Signal ---------------------------------------
            Signal gets its own full-width block below the other two, because it
            is the only step in the mechanism a competitor cannot also claim and
            the page should not give it a third of the room out of symmetry. */}
        <section id="how" className="scroll-mt-20 border-b">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {spec.mechanism.heading}
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[var(--muted-foreground)]">
              {spec.mechanism.lead}
            </p>

            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              <Step step="01" name="Gate" body={spec.mechanism.gate} />
              <Step step="02" name="Score" body={spec.mechanism.score} />
            </div>

            <div className="mt-6 rounded-xl border-2 border-green-600/40 bg-green-600/5 p-6 sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-wide text-green-600">
                03 · Signal
              </p>
              <p className="mt-4 max-w-3xl text-lg leading-relaxed sm:text-xl">
                {spec.mechanism.signal}
              </p>
              <ul className="mt-7 flex flex-col gap-4">
                {spec.mechanism.signalPoints.map((p) => (
                  <li key={p} className="flex gap-3">
                    <Tick />
                    <p className="leading-relaxed text-[var(--muted-foreground)]">{p}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---- Primary CTA, repeated -------------------------------------- */}
        <section className="border-b bg-[var(--muted)]">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
            <div className="flex max-w-3xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium">{OFFER.ctaSubline}</p>
              <Link
                href={INDUSTRY_CTA.primaryHref}
                className={buttonVariants({ size: "lg", className: "shrink-0" })}
              >
                {INDUSTRY_CTA.primaryLabel}
              </Link>
            </div>
          </div>
        </section>

        {/* ---- What happens next ------------------------------------------ */}
        <section id="after" className="scroll-mt-20 border-b">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{spec.after.heading}</h2>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[var(--muted-foreground)]">
              {spec.after.lead}
            </p>

            <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {spec.after.steps.map((s) => (
                <li key={s.n} className="border-t pt-5">
                  <span className="text-sm font-semibold text-green-600">{s.n}</span>
                  <h3 className="mt-2 font-semibold">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-[var(--muted-foreground)]">{s.body}</p>
                </li>
              ))}
            </ol>

            <p className="mt-10 max-w-2xl font-medium">{spec.after.note}</p>
          </div>
        </section>

        {/* ---- Fit and not-fit -------------------------------------------- */}
        <section id="fit" className="scroll-mt-20 border-b bg-[var(--muted)]">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{spec.fit.heading}</h2>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[var(--muted-foreground)]">
              {spec.fit.lead}
            </p>

            <div className="mt-10 grid gap-10 sm:grid-cols-2 sm:gap-16">
              <div>
                <h3 className="font-semibold">A fit if</h3>
                <ul className="mt-5 flex flex-col gap-3">
                  {spec.fit.forList.map((f) => (
                    <li key={f} className="border-t pt-3 text-sm sm:text-base">
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-[var(--muted-foreground)]">Not a fit if</h3>
                <ul className="mt-5 flex flex-col gap-3">
                  {spec.fit.notList.map((f) => (
                    <li
                      key={f}
                      className="border-t pt-3 text-sm text-[var(--muted-foreground)] sm:text-base"
                    >
                      {f}
                    </li>
                  ))}
                </ul>
                <p className="mt-6 border-l-2 border-green-600 pl-5 leading-relaxed">
                  {spec.fit.close}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---- Objections ------------------------------------------------- */}
        <section id="faq" className="scroll-mt-20 border-b">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              The questions this industry actually asks
            </h2>

            <div className="mt-10 max-w-3xl divide-y border-y">
              {spec.objections.map((o) => (
                <details key={o.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                    {o.q}
                    <svg
                      className="h-5 w-5 flex-none text-[var(--muted-foreground)] transition-transform group-open:rotate-45"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M12 5v14M5 12h14"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </summary>
                  <p className="mt-3 max-w-2xl leading-relaxed text-[var(--muted-foreground)]">
                    {o.a}
                  </p>
                </details>
              ))}
            </div>

            {/* RevenueOS, one sentence. No link and no section of its own, on
                purpose: it is an answer to a question some readers have, not a
                second product to sell on a page with one job. */}
            <p className="mt-10 max-w-2xl text-sm text-[var(--muted-foreground)]">{spec.crmLine}</p>
          </div>
        </section>

        {/* ---- Final CTA -------------------------------------------------- */}
        <section className="border-b">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <div className="rounded-2xl bg-[var(--foreground)] px-8 py-16 text-center sm:px-12">
              <h2 className="mx-auto max-w-2xl text-2xl font-bold tracking-tight text-[var(--background)] sm:text-3xl">
                {spec.finalCta.heading}
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-[var(--background)] opacity-70">
                {spec.finalCta.sub}
              </p>
              <Link
                href={INDUSTRY_CTA.primaryHref}
                className={buttonVariants({ size: "lg", className: "mt-8" })}
              >
                {INDUSTRY_CTA.primaryLabel}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Step({ step, name, body }: { step: string; name: string; body: string }) {
  return (
    <div className="rounded-xl border p-6 sm:p-7">
      <p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        {step} · {name}
      </p>
      <p className="mt-4 leading-relaxed text-[var(--muted-foreground)]">{body}</p>
    </div>
  );
}
