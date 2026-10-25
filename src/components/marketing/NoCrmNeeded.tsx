import { buttonVariants } from "@/components/ui/button";
import { NO_CRM } from "@/lib/marketing/content";
import { getCta } from "@/lib/settings/cta";
import { CtaLink } from "./CtaLink";
import { Emphasised, Tick } from "./Emphasised";

/**
 * "You will not need a CRM next to this."
 *
 * A section rather than a row of cards, for the same reason the metering argument is
 * one: it changes what the reader is comparing. A scorecard tool gets bought NEXT TO a
 * CRM, so its price is added to one they already pay. This gets bought INSTEAD of one,
 * and a reader doing that sum is reading a price cut rather than a feature list.
 *
 * Placed immediately after Metering, which is the other structural claim on the page, so
 * the two money arguments sit together and the capability grid below can stay evidence.
 *
 * The note is not decoration. Four of the six bullets are features the release catalog
 * is still holding back, and the cards further down say "Coming soon" on exactly those -
 * a section that asserted them flat would contradict the page it sits on. It comes out
 * when the switches are flipped, along with `soon` on the cards.
 */
export async function NoCrmNeeded() {
  const cta = await getCta();

  return (
    <section className="border-b">
      <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
        <h2 className="text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
          {NO_CRM.heading}
        </h2>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-[var(--muted-foreground)]">
          {NO_CRM.lead}
        </p>

        <ul className="mt-8 flex max-w-3xl flex-col gap-4">
          {NO_CRM.points.map((p) => (
            <li key={p.text} className="flex items-start gap-3">
              <Tick />
              <p className="leading-relaxed text-[var(--muted-foreground)]">
                <Emphasised text={p.text} strong={p.strong} />
              </p>
            </li>
          ))}
        </ul>

        <p className="mt-8 max-w-3xl rounded-xl border bg-[var(--muted)] p-5 text-sm leading-relaxed text-[var(--muted-foreground)]">
          {NO_CRM.note}
        </p>

        <p className="mt-8 max-w-3xl text-lg font-semibold leading-relaxed">{NO_CRM.closing}</p>

        <div className="mt-9">
          <CtaLink href={cta.href} className={buttonVariants({ size: "lg" })}>
            {cta.dfyLabel}
          </CtaLink>
        </div>
      </div>
    </section>
  );
}
