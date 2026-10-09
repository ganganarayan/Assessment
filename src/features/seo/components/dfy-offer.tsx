import Link from "next/link";
import { DFY, OFFER } from "@/lib/marketing/content";

/**
 * The done-for-you offer, on the industry pages.
 *
 * Comparison pages already carry it inside the migration block, where it is the natural
 * next line after "here is what moving across involves". An industry page has no such
 * moment, so it gets the offer on its own - and the calculator beside it, because a
 * reader on an industry page is usually still deciding whether they have the problem at
 * all, and a number they work out themselves settles that faster than a paragraph.
 */
export function DfyOffer({ audience }: { audience?: string }) {
  return (
    <section id="done-for-you" className="scroll-mt-20 rounded-xl border bg-[var(--muted)] p-6 sm:p-8">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{DFY.heading}</h2>
      <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">
        {audience ? `Tell us what you sell and who wastes your time, ` : `Tell us what you sell, `}
        and we write the gate, the questions, the weights and the result bands. Then we take it
        live with you on one 30-minute call. You do not touch the builder unless you want to.
      </p>
      <p className="mt-3 font-medium">{OFFER.ctaSubline}</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href={DFY.href}
          className="inline-flex h-11 items-center justify-center rounded-md bg-green-600 px-6 font-medium text-white"
        >
          {DFY.cta}
        </Link>
        <Link
          href="/wasted-call-calculator"
          className="inline-flex h-11 items-center justify-center rounded-md border px-6 font-medium"
        >
          First, see what the wrong calls cost
        </Link>
      </div>
    </section>
  );
}
