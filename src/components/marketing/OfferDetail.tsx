import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { OFFER_SLOTS, TIERS } from "@/lib/marketing/content";
import { formatISTDate } from "@/lib/date";
import type { Offer } from "@/lib/marketing/offers";

/**
 * A TODO that survives into the SERVED PAGE, not just the source.
 *
 * Where real data is missing the rule is to leave the gap visible rather than fill it
 * with something plausible, and a JSX comment is stripped before the browser ever sees
 * it. This emits a genuine HTML comment, so "what is still unanswered on this page" is
 * answerable by viewing source on the deployed page instead of by reading the repo.
 */
function MarkupTodo({ text }: { text: string }) {
  return <div hidden dangerouslySetInnerHTML={{ __html: `<!-- TODO: ${text} -->` }} />;
}

/**
 * One offer, rendered whole.
 *
 * Deliberately not a card in a grid. An offer is read top to bottom and acted on at
 * the end.
 *
 * THE ORDER IS THE ARGUMENT, and it is not the order the offer was written in:
 *
 *   1. the MECHANISM, before anything else, because ads point straight at this page
 *      and a cold visitor cannot value "20 slots" for something they cannot name yet;
 *   2. the offer, and immediately what happens if it does not work;
 *   3. the MONEY, this early on purpose - "free" next to "ad spend" next to "and then
 *      what" is the question everybody arrives with, and leaving it until a bullet
 *      list halfway down reads as hiding it;
 *   4. who is in the build;
 *   5. ELIGIBILITY, above the plan, because it decides whether to keep reading;
 *   6. what the week costs them in hours, then the plan itself;
 *   7. what we ask back, then the call to action.
 *
 * Everything from 1 to 7 is OPTIONAL in the data. A closed offer carries none of it
 * and falls back to the flat terms-and-preconditions shape it actually ran on, so the
 * archive still renders what people were promised.
 *
 * The slot counter and the closed state are passed in rather than read here: this
 * component renders closed offers too, and a count belongs to the request, not to the
 * copy.
 */
export function OfferDetail({
  offer,
  slotsLeft,
  closed,
}: {
  offer: Offer;
  slotsLeft: number | null;
  /** Status closed, or the application window has passed. See offerClosed(). */
  closed: boolean;
}) {
  const open = !closed;

  // The count appears only once it is actually scarce. Above the threshold the cap on
  // its own is both honest and stronger: "18 of 20 left" advertises how few took it.
  const threshold = offer.slotCounterThreshold ?? 0;
  const showCount =
    open && offer.countsSlots && slotsLeft !== null && slotsLeft < threshold;

  return (
    <article id={offer.slug} className="scroll-mt-24 border-b">
      <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        {/* 1. The mechanism, for traffic that has never seen the main page. */}
        {offer.mechanism && open ? (
          <section className="mb-14 border-b pb-12">
            <p className="text-sm font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">
              {offer.mechanism.eyebrow}
            </p>
            <h2 className="mt-3 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
              {offer.mechanism.heading}
            </h2>
            <ol className="mt-7 flex flex-col gap-4 sm:grid sm:grid-cols-3">
              {offer.mechanism.steps.map((s) => (
                <li key={s.name} className="rounded-xl border p-5">
                  <p className="font-bold text-green-600">{s.name}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
                    {s.body}
                  </p>
                </li>
              ))}
            </ol>
            <p className="mt-6 font-medium">{offer.mechanism.kicker}</p>
          </section>
        ) : null}

        {/* 2. The offer, and its failure case. */}
        <p className="text-sm font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">
          {offer.eyebrow}
        </p>
        <h2 className="mt-3 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
          {offer.name}
        </h2>
        <p className="mt-5 text-lg leading-relaxed">{offer.promise}</p>

        {open ? (
          <p className="mt-5 inline-block rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-2 text-sm font-medium text-green-800 dark:text-green-400">
            {showCount
              ? `${slotsLeft} of ${OFFER_SLOTS} slots left.`
              : `${OFFER_SLOTS} slots.`}
            {offer.closesOn ? ` Applications close ${formatISTDate(`${offer.closesOn}T00:00:00Z`)}.` : null}
          </p>
        ) : (
          <p className="mt-5 rounded-lg border bg-[var(--muted)] px-4 py-3 text-sm font-medium">
            {offer.closedNote ?? "This offer has closed. The terms it ran on are below."}
          </p>
        )}

        {offer.fallbackNote && open ? (
          <p className="mt-5 rounded-xl border-l-2 border-green-600 bg-[var(--muted)] px-5 py-4 leading-relaxed">
            {offer.fallbackNote}
          </p>
        ) : null}

        {offer.paras.map((p) => (
          <p key={p} className="mt-4 leading-relaxed text-[var(--muted-foreground)]">
            {p}
          </p>
        ))}

        {/* 3. The money, early. */}
        {offer.cost && open ? (
          <>
            <h3 className="mt-12 text-lg font-semibold">{offer.cost.heading}</h3>
            <ul className="mt-5 flex flex-col gap-4">
              {offer.cost.items.map((c) => (
                <li key={c.title} className="rounded-xl border p-5">
                  <h4 className="font-semibold">{c.title}</h4>
                  <p className="mt-2 leading-relaxed text-[var(--muted-foreground)]">{c.body}</p>
                </li>
              ))}
            </ul>

            {/* Every tier, both prices, no button.
                The plan is the reader's choice and all four are shown so they make it,
                but the only call to action on this page is the application: a trial
                button here would let somebody start the 14-day clock BEFORE we have
                checked their ad account, which is the one order in which the 21 days
                cannot be delivered. That is also why TIERS is read directly instead of
                reusing <Pricing>, which carries a trial CTA in every column. */}
            <div className="mt-6 rounded-xl border bg-[var(--muted)] p-5">
              <h4 className="font-semibold">The plans, so you know what you are choosing</h4>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
                You pick one when the trial ends, not now. Prices are per month, and the
                second figure is the per-month price when it is billed yearly.
              </p>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {TIERS.map((t) => (
                  <li key={t.name} className="rounded-lg border bg-[var(--background)] p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <h5 className="font-semibold">{t.name}</h5>
                      <p className="text-sm font-medium">
                        {t.price}
                        <span className="text-[var(--muted-foreground)]">{t.period}</span>
                      </p>
                    </div>
                    {t.annual ? (
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {t.annual} / month billed yearly
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
                      {t.blurb}
                    </p>
                  </li>
                ))}
              </ul>
              <Link
                href="/pricing"
                className="mt-5 inline-block text-sm font-medium underline underline-offset-4"
              >
                The full comparison, feature by feature
              </Link>
            </div>
          </>
        ) : null}

        {/* Every blank still waiting on real data, as HTML comments. */}
        {open ? offer.todos?.map((t) => <MarkupTodo key={t} text={t} />) : null}

        {/* 4. Who is in the build. Renders nothing while the real person is unnamed:
            the anonymous version answers the reader's question with a refusal to answer
            it, which is worse than leaving the question open. */}
        {open && offer.builder ? (
          <>
            <h3 className="mt-12 text-lg font-semibold">Who is doing the build</h3>
            <div className="mt-4 rounded-xl border p-5">
              <p className="font-semibold">
                {offer.builder.name}, {offer.builder.role}
              </p>
              <p className="mt-2 leading-relaxed text-[var(--muted-foreground)]">
                {offer.builder.built} They are in your ad account and your workspace for the
                21 days, on the calls with you, and they are the same person on day 1 and on
                day 21.
              </p>
            </div>
          </>
        ) : null}

        {/* 5. Eligibility and preparation, ABOVE the plan. */}
        {offer.entry && open
          ? offer.entry.map((group) => (
              <div key={group.title}>
                <h3 className="mt-12 text-lg font-semibold">{group.title}</h3>
                {group.intro ? (
                  <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">
                    {group.intro}
                  </p>
                ) : null}
                <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                  {group.items.map((p) => (
                    <li key={p.title} className="rounded-xl border bg-[var(--muted)] p-5">
                      <h4 className="font-semibold">{p.title}</h4>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
                        {p.body}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          : null}

        {/* 6. The hours, then the plan. */}
        {offer.timeCommitment && open ? (
          <>
            <h3 className="mt-12 text-lg font-semibold">{offer.timeCommitment.heading}</h3>
            <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">
              {offer.timeCommitment.body}
            </p>
          </>
        ) : null}

        <h3 className="mt-12 text-lg font-semibold">The 21 days</h3>
        <ol className="mt-6 flex flex-col gap-4">
          {offer.stages.map((s) => (
            <li key={s.days} className="rounded-xl border p-5 sm:p-6">
              <p className="text-sm font-bold text-green-600">{s.days}</p>
              <h4 className="mt-2 font-semibold">{s.title}</h4>
              <p className="mt-2 leading-relaxed text-[var(--muted-foreground)]">{s.body}</p>
              {s.note ? (
                <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">{s.note}</p>
              ) : null}
            </li>
          ))}
        </ol>

        {/* 7. What we ask back. */}
        {offer.askInReturn && open ? (
          <>
            <h3 className="mt-12 text-lg font-semibold">{offer.askInReturn.heading}</h3>
            <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">
              {offer.askInReturn.body}
            </p>
          </>
        ) : null}

        {/* The flat shape, for an offer that ran before the blocks above existed. */}
        {offer.terms.length > 0 ? (
          <>
            <h3 className="mt-12 text-lg font-semibold">What you get, and what it costs</h3>
            <ul className="mt-4 flex flex-col gap-3">
              {offer.terms.map((t) => (
                <li key={t} className="flex gap-3 leading-relaxed text-[var(--muted-foreground)]">
                  <span
                    aria-hidden="true"
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-green-600"
                  />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {offer.preconditions.length > 0 ? (
          <>
            <h3 className="mt-12 text-lg font-semibold">Before day 1</h3>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {offer.preconditions.map((p) => (
                <li key={p.title} className="rounded-xl border bg-[var(--muted)] p-5">
                  <h4 className="font-semibold">{p.title}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
                    {p.body}
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {open ? (
          <div className="mt-12">
            {/* A plain Link, not <CtaLink>: this button goes to the intake, and the ad
                params a visitor arrived with are already on the cookie middleware wrote
                when they landed. */}
            <Link href={offer.applyHref} className={buttonVariants({ size: "lg" })}>
              {offer.applyLabel}
            </Link>
            {offer.applyNote ? (
              <p className="mt-3 text-sm text-[var(--muted-foreground)]">{offer.applyNote}</p>
            ) : null}
            {offer.applyFollowUp ? (
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                {offer.applyFollowUp}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
