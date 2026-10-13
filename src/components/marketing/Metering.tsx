import { buttonVariants } from "@/components/ui/button";
import { METERING, OFFER } from "@/lib/marketing/content";
import { getCta } from "@/lib/settings/cta";
import { CtaLink } from "./CtaLink";
import { Emphasised, Tick } from "./Emphasised";

/**
 * The metering argument, high on the page.
 *
 * It was one line above the pricing table, which is the last place a visitor reaches and
 * the first place they stop reading. It is the strongest thing on the site because it is
 * not a marketing claim at all - it describes an incentive, and the reader can check it
 * against their own invoice. Everything else here asks for trust; this asks to be
 * audited.
 *
 * Bulleted rather than two paragraphs, because the argument is a chain. Each link is one
 * line, so a reader who skims still arrives at the conclusion instead of seeing a block
 * of text that looks like the small print.
 */
export async function Metering() {
  const cta = await getCta();

  return (
    <section className="border-b bg-[var(--muted)]">
      {/* Wider than the prose it holds, on purpose. At max-w-3xl the headline broke
          across two lines on a desktop that had room for one, which makes the single
          most checkable claim on the page read as an afterthought. The column widens
          for the heading; the paragraph and the list keep a readable measure below. */}
      <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
        <h2 className="text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
          {METERING.heading}
        </h2>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-[var(--muted-foreground)]">
          {METERING.lead}
        </p>

        <ul className="mt-8 flex max-w-3xl flex-col gap-4">
          {METERING.points.map((p) => (
            <li key={p.text} className="flex items-start gap-3">
              <Tick />
              <p className="leading-relaxed text-[var(--muted-foreground)]">
                <Emphasised text={p.text} strong={p.strong} />
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-9 flex flex-col items-start gap-3">
          <CtaLink href={cta.href} className={buttonVariants({ size: "lg" })}>
            {cta.dfyLabel}
          </CtaLink>
          {/* The slot COUNT lives in the offer bar; this is the standing sub-line, in
              the same words it carries everywhere else. */}
          <p className="text-sm font-medium">{OFFER.ctaSubline}</p>
        </div>
      </div>
    </section>
  );
}
