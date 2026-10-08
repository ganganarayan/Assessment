import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { METERING, DFY } from "@/lib/marketing/content";

/**
 * The metering argument, immediately below the hero.
 *
 * It was one line above the pricing table, which is the last place a visitor reaches and
 * the first place they stop reading. It is the strongest sentence on the site because it
 * is not a marketing claim at all - it describes an incentive, and the reader can check
 * it against their own invoice. Everything else here asks for trust; this asks to be
 * audited.
 */
export function Metering() {
  return (
    <section className="border-b bg-[var(--muted)]">
      <div className="mx-auto max-w-4xl px-5 py-16 text-center sm:px-8 sm:py-20">
        <h2 className="text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
          {METERING.heading}
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[var(--muted-foreground)]">
          {METERING.body}
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-[var(--muted-foreground)]">
          {METERING.body2}
        </p>
        <div className="mt-8">
          <Link href={DFY.href} className={buttonVariants({ size: "lg" })}>
            {DFY.cta}
          </Link>
        </div>
      </div>
    </section>
  );
}
