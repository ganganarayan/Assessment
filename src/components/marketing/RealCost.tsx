import { REAL_COST } from "@/lib/marketing/content";

/**
 * The bill as arithmetic, straight after the itemised one.
 *
 * DisqualifiedCost above says what the charges ARE, line by line; this says what they
 * come to in a month, which is the one thing a list cannot do. It no longer sits directly
 * under the hero and no longer calls itself "the second cost": counting to two under a
 * list of eighteen charges undersells the problem, and the point of both sections is that
 * the charges repeat rather than arriving once.
 *
 * No call to action, like the section above it: these two exist to make the next five
 * worth reading, and asking for something here would spend the attention they just earned.
 */
export function RealCost() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{REAL_COST.heading}</h2>
          {REAL_COST.paras.map((t) => (
            <p key={t.slice(0, 24)} className="mt-5 text-lg leading-relaxed text-[var(--muted-foreground)]">
              {t}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
