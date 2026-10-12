import { REAL_COST } from "@/lib/marketing/content";

/**
 * The second cost, directly under the hero.
 *
 * It sits here rather than further down because the hero makes a claim about what a bad
 * lead does to the ad account, and this is the half of the bill the reader has already
 * paid without ever seeing it itemised. No call to action: the section's whole job is to
 * make the next five sections worth reading, and asking for something here would spend
 * the attention it just earned.
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
