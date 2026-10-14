import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { Offer } from "@/lib/marketing/offers";

/**
 * One offer, rendered whole: the promise, the limits, the day-by-day plan and the
 * preconditions.
 *
 * Deliberately not a card in a grid. An offer is read top to bottom and acted on at
 * the end, and the preconditions are the part that decides whether anyone should
 * apply at all - which is why they are a section here rather than small print.
 *
 * The slot counter is passed in rather than read here: this component renders closed
 * offers too, and a count belongs to the request, not to the copy.
 */
export function OfferDetail({ offer, slotsLeft }: { offer: Offer; slotsLeft: number | null }) {
  const open = offer.status === "open";
  const showSlots = open && offer.countsSlots && slotsLeft !== null;

  return (
    <article id={offer.slug} className="scroll-mt-24 border-b">
      <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <p className="text-sm font-semibold text-green-700 dark:text-green-400">{offer.eyebrow}</p>
        <h2 className="mt-3 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
          {offer.name}
        </h2>
        <p className="mt-5 text-lg leading-relaxed">{offer.promise}</p>

        {showSlots ? (
          <p className="mt-5 inline-block rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-2 text-sm font-medium text-green-800 dark:text-green-400">
            {slotsLeft} of 20 slots left.
          </p>
        ) : null}

        {!open ? (
          <p className="mt-5 rounded-lg border bg-[var(--muted)] px-4 py-3 text-sm font-medium">
            {offer.closedNote ?? "This offer has closed."}
          </p>
        ) : null}

        {offer.paras.map((p) => (
          <p key={p} className="mt-4 leading-relaxed text-[var(--muted-foreground)]">
            {p}
          </p>
        ))}

        <h3 className="mt-12 text-lg font-semibold">What you get, and what it costs</h3>
        <ul className="mt-4 flex flex-col gap-3">
          {offer.terms.map((t) => (
            <li key={t} className="flex gap-3 leading-relaxed text-[var(--muted-foreground)]">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-green-600" />
              <span>{t}</span>
            </li>
          ))}
        </ul>

        <h3 className="mt-12 text-lg font-semibold">The 21 days</h3>
        <ol className="mt-6 flex flex-col gap-4">
          {offer.stages.map((s) => (
            <li key={s.days} className="rounded-xl border p-5 sm:p-6">
              <p className="text-sm font-bold text-green-600">{s.days}</p>
              <h4 className="mt-2 font-semibold">{s.title}</h4>
              <p className="mt-2 leading-relaxed text-[var(--muted-foreground)]">{s.body}</p>
            </li>
          ))}
        </ol>

        <h3 className="mt-12 text-lg font-semibold">Before day 1</h3>
        <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">
          These have to be ready for the 21 days to work. The clock does not stop while one
          of them is being sorted out, so sort them out first.
        </p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {offer.preconditions.map((p) => (
            <li key={p.title} className="rounded-xl border bg-[var(--muted)] p-5">
              <h4 className="font-semibold">{p.title}</h4>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">{p.body}</p>
            </li>
          ))}
        </ul>

        {open ? (
          <div className="mt-12">
            {/* A plain Link, not <CtaLink>: this button goes to the intake form, and the
                ad params a visitor arrived with are already on the cookie middleware
                wrote when they landed. */}
            <Link href={offer.applyHref} className={buttonVariants({ size: "lg" })}>
              {offer.applyLabel}
            </Link>
            <p className="mt-3 text-sm text-[var(--muted-foreground)]">
              Four minutes of questions. We read it, and come back on whether the fit is
              there and which slot you are in.
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}
