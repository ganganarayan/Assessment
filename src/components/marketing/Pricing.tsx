import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MARKETING, TIERS, FOUNDING_NOTE } from "@/lib/marketing/content";

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 border-b bg-[var(--muted)]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Pricing that scales with volume, not features
          </h2>
          <p className="mt-4 text-lg text-[var(--muted-foreground)]">
            The builder stays generous at every tier. You pay as your responses, seats, and
            sub-accounts grow. Prices in USD.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-4">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                "flex flex-col rounded-2xl border bg-[var(--background)] p-7",
                tier.highlight && "border-green-600 shadow-lg ring-1 ring-green-600",
              )}
            >
              {tier.badge ? (
                <span className="mb-4 inline-flex w-fit items-center rounded-full bg-green-600 px-3 py-1 text-xs font-semibold text-white">
                  {tier.badge}
                </span>
              ) : null}
              <h3 className="text-lg font-semibold">{tier.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">{tier.price}</span>
                <span className="text-sm text-[var(--muted-foreground)]">{tier.period}</span>
              </div>
              <p className="mt-3 min-h-12 text-sm leading-relaxed text-[var(--muted-foreground)]">
                {tier.blurb}
              </p>

              <Link
                href={MARKETING.signupHref}
                className={cn(
                  "mt-5",
                  buttonVariants({ variant: tier.highlight ? "default" : "outline" }),
                )}
              >
                {tier.cta}
              </Link>

              <ul className="mt-6 space-y-3 border-t pt-6">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[var(--muted-foreground)]">
                    <svg
                      className="mt-0.5 h-4 w-4 flex-none text-green-600"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M5 12l4 4L19 6"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm font-medium text-[var(--muted-foreground)]">
          {FOUNDING_NOTE}
        </p>
      </div>
    </section>
  );
}
