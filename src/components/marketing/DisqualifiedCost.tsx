import { DISQUALIFIED_COST } from "@/lib/marketing/content";
import { Emphasised } from "./Emphasised";

/**
 * What one disqualified lead actually costs, itemised, directly under the hero.
 *
 * The premise of the entire product is that a lead who will never buy is EXPENSIVE, and
 * expensive every month rather than once. A reader who has not accepted that premise has
 * no reason to read the rest of the page, and nobody accepts it from a summary - "bad
 * leads waste money" is a platitude. So it is presented as a bill: numbered, in the order
 * the charges arrive, with the loop in the middle where the same person signs up again.
 *
 * AMBER, NOT GREEN AND NOT RED. Green is the page's "this is fine" colour and appears on
 * every tick in every other section, so green here would read as approval of a leak. Red
 * is reserved for genuine danger. These are charges that need attention, which is amber.
 *
 * No call to action, like RealCost below it. The two cost sections exist to earn the
 * attention the next five spend; asking for something here spends it instead.
 */
export function DisqualifiedCost() {
  return (
    <section className="border-b bg-amber-500/[0.06]">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-500">
            The bill nobody itemises
          </p>
          <h2 className="mt-2 text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
            {DISQUALIFIED_COST.heading}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-[var(--muted-foreground)]">
            {DISQUALIFIED_COST.lead}
          </p>
        </div>

        {/* The sequence. Numbered because the compounding IS the argument: step six is
            where the same person arrives a second time and steps three, four and seven
            are the same charges arriving again. Two columns from `lg` only - the numbers
            carry the order, so the shorter block costs nothing, and on a phone it stays
            one honest column. */}
        <ol className="mt-10 grid gap-x-10 gap-y-4 lg:grid-cols-2">
          {DISQUALIFIED_COST.chain.map((p, i) => (
            <li key={p.text} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-sm font-bold text-amber-700 dark:text-amber-400"
              >
                {i + 1}
              </span>
              <p className="leading-relaxed text-[var(--muted-foreground)]">
                <Emphasised text={p.text} strong={p.strong} />
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-12 border-t pt-10">
          <h3 className="text-lg font-semibold sm:text-xl">{DISQUALIFIED_COST.hiddenHeading}</h3>
          {/* Unnumbered, because these are simultaneous rather than consecutive. They are
              also the ones a reader has never counted, which is why they come second: the
              numbered chain earns the right to be believed about these. */}
          <ul className="mt-6 grid gap-x-10 gap-y-4 lg:grid-cols-2">
            {DISQUALIFIED_COST.hidden.map((p) => (
              <li key={p.text} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600 dark:bg-amber-500"
                />
                <p className="leading-relaxed text-[var(--muted-foreground)]">
                  <Emphasised text={p.text} strong={p.strong} />
                </p>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-12 max-w-3xl border-l-2 border-amber-600 pl-5 text-lg font-semibold leading-relaxed sm:text-xl">
          {DISQUALIFIED_COST.closing}
        </p>
      </div>
    </section>
  );
}
