"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MARKETING,
  TIERS,
  PLAN_MATRIX,
  PLAN_NAMES,
  PRICING_HEADLINE,
  PRICING_SUB,
  TRIAL_NOTE,
  OVERAGE_NOTE,
} from "@/lib/marketing/content";

/**
 * Pricing.
 *
 * 🟢 BOTH PRICES ARE ALWAYS IN THE HTML. The monthly/annual toggle hides one with CSS
 * rather than removing it from the tree, and the whole comparison matrix is rendered
 * server-side. That is deliberate: AI answer engines and comparison sites quote pricing
 * pages constantly, and they read markup, not React state. ScoreApp's annual totals are
 * script-rendered and comparison sites complain they cannot be read - rendering both is
 * a free win on the single page most likely to be cited.
 *
 * So: never replace this with a conditional that renders only the active price.
 */
export function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="scroll-mt-20 border-b bg-[var(--muted)]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{PRICING_HEADLINE}</h2>
          <p className="mt-4 text-lg text-[var(--muted-foreground)]">{PRICING_SUB}</p>
        </div>

        {/* Billing toggle */}
        <div className="mt-10 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAnnual(false)}
            aria-pressed={!annual}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              !annual
                ? "bg-green-600 text-white"
                : "border text-[var(--muted-foreground)] hover:bg-[var(--background)]",
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setAnnual(true)}
            aria-pressed={annual}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              annual
                ? "bg-green-600 text-white"
                : "border text-[var(--muted-foreground)] hover:bg-[var(--background)]",
            )}
          >
            Annual
            <span className="ml-1.5 text-xs opacity-80">save up to 18%</span>
          </button>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-4">
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
                {/* Both rendered; one hidden. See the note at the top of this file. */}
                <span className={cn("text-4xl font-bold tracking-tight", annual && "hidden")}>
                  {tier.price}
                </span>
                <span className={cn("text-4xl font-bold tracking-tight", !annual && "hidden")}>
                  {tier.annual ?? tier.price}
                </span>
                <span className="text-sm text-[var(--muted-foreground)]">{tier.period}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {tier.annual
                  ? annual
                    ? `billed yearly · ${tier.price} month-to-month`
                    : `or ${tier.annual}/mo billed yearly`
                  : "custom, billed yearly"}
              </p>

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
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm text-[var(--muted-foreground)]"
                  >
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

        <div className="mt-8 flex flex-col gap-2 text-sm text-[var(--muted-foreground)] sm:flex-row sm:justify-between">
          <p className="font-medium">{TRIAL_NOTE}</p>
          <p>{OVERAGE_NOTE}</p>
        </div>

        {/* Full comparison - always in the markup, for readers and for crawlers. */}
        <div className="mt-14">
          <h3 className="text-xl font-semibold tracking-tight">Compare every plan</h3>
          <div className="mt-5 overflow-x-auto rounded-xl border bg-[var(--background)]">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <caption className="sr-only">Assess360 plan comparison</caption>
              <thead>
                <tr className="border-b bg-[var(--muted)]/50">
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Plan
                  </th>
                  {PLAN_NAMES.map((n) => (
                    <th key={n} scope="col" className="px-4 py-3 text-left font-semibold">
                      {n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PLAN_MATRIX.map((row) => (
                  <tr key={row.label} className="border-b last:border-0">
                    <th
                      scope="row"
                      className={cn(
                        "px-4 py-3 text-left font-normal text-[var(--muted-foreground)]",
                        row.strong && "font-semibold text-[var(--foreground)]",
                        row.note && "italic",
                      )}
                    >
                      {row.label}
                    </th>
                    {row.cells.map((c, i) => (
                      <td
                        key={`${row.label}-${PLAN_NAMES[i]}`}
                        className={cn(
                          "px-4 py-3",
                          c === "✓" && "text-green-600",
                          c === "-" && "text-[var(--muted-foreground)]",
                          row.note && "italic text-green-600",
                        )}
                      >
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
