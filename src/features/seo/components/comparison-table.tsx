import Link from "next/link";
import { MARKETING, DFY, OFFER } from "@/lib/marketing/content";
import type { SeoPage } from "@/lib/seo/types";

/**
 * The head-to-head table, the migration offer, and the "when they are the better
 * choice" paragraph - the three blocks every comparison page carries.
 *
 * 🔴 The rows the competitor WINS are marked, and marked visibly. A table of ticks in
 * one column is an advertisement; a reader who has actually used the other product spots
 * it in two rows and then disbelieves the rest, including the rows that are true. The
 * concessions are what the comparison is spending to buy credibility for everything
 * else, so hiding them defeats the whole page.
 *
 * On a phone the table becomes a stack of labelled pairs rather than a horizontally
 * scrolling grid. A comparison the reader has to swipe sideways to read is one they do
 * not read.
 */
export function ComparisonTable({ table }: { table: NonNullable<SeoPage["comparison"]> }) {
  return (
    <section id="side-by-side" className="scroll-mt-20">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
        {MARKETING.name} and {table.competitor}, side by side
      </h2>
      <p className="mt-3 text-[var(--muted-foreground)]">
        Where {table.competitor} is genuinely better, the row says so. A table that was all
        ticks in one column would not be worth reading.
      </p>

      {/* Stacked cards on a phone. */}
      <div className="mt-6 flex flex-col gap-3 sm:hidden">
        {table.rows.map((r) => (
          <div key={r.label} className="rounded-lg border p-4">
            <p className="text-sm font-semibold">{r.label}</p>
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-[var(--muted-foreground)]">{MARKETING.name}</dt>
                <dd>{r.us}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-[var(--muted-foreground)]">{table.competitor}</dt>
                <dd className={r.themWins ? "font-semibold" : undefined}>
                  {r.them}
                  {r.themWins ? <ThemWins /> : null}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <div className="mt-6 hidden overflow-hidden rounded-lg border sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[var(--muted)] text-left">
              <th scope="col" className="w-2/5 px-4 py-3 font-semibold">
                &nbsp;
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                {MARKETING.name}
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                {table.competitor}
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.label} className="border-t align-top">
                <th scope="row" className="px-4 py-3 text-left font-medium">
                  {r.label}
                </th>
                <td className="px-4 py-3 text-[var(--muted-foreground)]">{r.us}</td>
                <td
                  className={
                    r.themWins ? "px-4 py-3 font-semibold" : "px-4 py-3 text-[var(--muted-foreground)]"
                  }
                >
                  {r.them}
                  {r.themWins ? <ThemWins /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {table.source ? (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          {table.competitor} figures: {table.source}. Prices and plan limits change without
          notice, so check their current pricing page before you decide anything on them.
        </p>
      ) : null}
    </section>
  );
}

function ThemWins() {
  return (
    <span className="ml-2 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
      They win
    </span>
  );
}

/**
 * "Bring your existing scorecard across."
 *
 * One component rather than a paragraph per page, because the offer is identical on all
 * thirteen and thirteen hand-written versions of one promise is how three of them end up
 * describing a different promise.
 */
export function MigrationBlock({ competitor }: { competitor: string }) {
  return (
    <section id="migration" className="scroll-mt-20 rounded-xl border bg-[var(--muted)] p-6 sm:p-8">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
        Bringing your {competitor} scorecard across
      </h2>
      <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">
        There is no one-click importer, and anyone who promises you one is describing a
        different problem. Questions move easily. What does not move is the part that
        matters here, because {competitor} has nowhere to put it: the gate, the weights
        behind each answer, and the events that report back to your ad account.
      </p>
      <ul className="mt-5 flex flex-col gap-2 leading-relaxed text-[var(--muted-foreground)]">
        <li>
          <strong className="text-[var(--foreground)]">Paste your questions in.</strong> The
          plain-text importer takes a list of questions and options on every plan.
        </li>
        <li>
          <strong className="text-[var(--foreground)]">We write the gate.</strong> That part
          is new, because it did not exist in the tool you are leaving.
        </li>
        <li>
          <strong className="text-[var(--foreground)]">Or we do the whole thing, free.</strong>{" "}
          Send us your live {competitor} link, we rebuild it with a gate in front of it, and we
          take it live together on one 30-minute call. Before you have paid for anything.
        </li>
      </ul>
      <div className="mt-6">
        <Link
          href={DFY.href}
          className="inline-flex h-11 items-center justify-center rounded-md bg-green-600 px-6 font-medium text-white"
        >
          {DFY.cta}
        </Link>
        <p className="mt-3 text-sm font-medium">{OFFER.ctaSubline}</p>
      </div>
    </section>
  );
}

/** When the other product is the better choice. Short, and kept. */
export function BetterWhen({ competitor, body }: { competitor: string; body: string }) {
  return (
    <section id="better-when" className="scroll-mt-20">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
        When {competitor} is the better choice
      </h2>
      <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">{body}</p>
    </section>
  );
}

/** Page-level questions. Also emitted as FAQPage JSON-LD by the graph builder. */
export function PageFaqs({ faqs }: { faqs: ReadonlyArray<{ q: string; a: string }> }) {
  return (
    <section id="faq" className="scroll-mt-20">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Questions people ask</h2>
      <div className="mt-5 flex flex-col gap-6">
        {faqs.map((f) => (
          <div key={f.q}>
            <h3 className="font-semibold">{f.q}</h3>
            <p className="mt-2 leading-relaxed text-[var(--muted-foreground)]">{f.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
