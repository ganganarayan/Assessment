import Link from "next/link";
import { Nav } from "@/components/marketing/Nav";
import { Footer } from "@/components/marketing/Footer";
import { Breadcrumbs } from "./breadcrumbs";
import { SectionBody } from "./section-body";
import { AnswerList } from "./answer-list";
import { OnThisPage } from "./on-this-page";
import { SeoCta } from "./seo-cta";
import { ComparisonTable, MigrationBlock, BetterWhen, PageFaqs } from "./comparison-table";
import { DfyOffer } from "./dfy-offer";
import type { Answer, SeoPage } from "@/lib/seo/types";
import { seoPath } from "@/lib/seo/urls";

/**
 * The one renderer every composed page uses - pillars today, use-case and comparison
 * pages next, with no second layout to keep in step.
 *
 * Structure is the argument: breadcrumb, H1, the lede that answers the page's own
 * question in three sentences, jump links, then the sections. Someone who reads only the
 * lede has the answer; someone who reads the headings has the shape; someone who reads
 * it all has the detail. Nothing is behind a click, so everything is in the HTML.
 */
export function SeoPageShell({
  page,
  answers,
  related,
  jsonLd,
}: {
  page: SeoPage;
  answers: ReadonlyArray<Answer>;
  related: ReadonlyArray<SeoPage>;
  jsonLd: string;
}) {
  const faqs = page.faqs ?? [];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <Nav anchorBase="/" />
      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <Breadcrumbs trail={[{ name: "Home", href: "/" }, { name: page.shortName, href: seoPath(page.slug) }]} />

        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{page.h1}</h1>
        <p className="mt-5 text-lg leading-relaxed text-[var(--foreground)]">{page.lede}</p>

        {/* Named a competitor? Then say when this was checked and that it may have moved
            since. Directly under the lede, because a reader deciding how much weight to
            give the comparison should know before reading it, not after. */}
        {page.factsCheckedOn ? (
          <p className="mt-5 rounded-md border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
            Compared on{" "}
            {new Date(`${page.factsCheckedOn}T00:00:00Z`).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
            . Other products change their features and pricing without notice, so treat this as
            what was true on that date and check their current site before you decide.
          </p>
        ) : null}

        <OnThisPage
          sections={page.sections}
          extra={[
            ...(page.comparison ? [{ id: "side-by-side", label: "Side by side" }] : []),
            ...(page.betterWhen && page.comparison
              ? [{ id: "better-when", label: `When ${page.comparison.competitor} is better` }]
              : []),
            ...(page.comparison ? [{ id: "migration", label: "Moving across" }] : []),
            ...(faqs.length > 0 ? [{ id: "faq", label: "Questions people ask" }] : []),
            ...(answers.length > 0 ? [{ id: "answers", label: "Common questions" }] : []),
          ]}
        />

        <div className="flex flex-col gap-12">
          {page.sections.map((s) => (
            <SectionBody key={s.id} section={s} />
          ))}

          {/* Order is deliberate: the table states the difference, the concession makes
              the table believable, and the migration offer is what to do about it. An
              offer placed before the concession reads as a pitch interrupting an
              argument. */}
          {page.comparison ? <ComparisonTable table={page.comparison} /> : null}
          {page.comparison && page.betterWhen ? (
            <BetterWhen competitor={page.comparison.competitor} body={page.betterWhen} />
          ) : null}
          {page.comparison ? <MigrationBlock competitor={page.comparison.competitor} /> : null}
          {faqs.length > 0 ? <PageFaqs faqs={faqs} /> : null}

          {/* Industry pages get the done-for-you offer of their own. Comparison pages
              already carry it inside the migration block, and a second copy on the same
              page would be two asks in a row rather than one. */}
          {page.kind === "use-case" ? <DfyOffer audience={page.shortName} /> : null}

          <AnswerList answers={answers} heading="Common questions" />
        </div>

        {related.length > 0 ? (
          <section className="mt-12 border-t pt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Related
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link href={seoPath(r.slug)} className="underline underline-offset-4">
                    {r.shortName}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <SeoCta heading={page.cta.heading} body={page.cta.body} />

        <p className="mt-10 text-xs text-[var(--muted-foreground)]">
          Last updated {page.updatedAt}
        </p>
      </main>
      <Footer />
    </>
  );
}
