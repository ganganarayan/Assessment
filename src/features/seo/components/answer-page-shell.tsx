import Link from "next/link";
import { Nav } from "@/components/marketing/Nav";
import { Footer } from "@/components/marketing/Footer";
import { Breadcrumbs } from "./breadcrumbs";
import { SectionBody } from "./section-body";
import { SeoCta } from "./seo-cta";
import type { Answer, SeoPage, Topic } from "@/lib/seo/types";
import { answerPath, seoPath } from "@/lib/seo/urls";

/**
 * One question per page, answered in a sentence before anything else.
 *
 * The short answer is rendered first and rendered large, because that is the unit of
 * value here: a person should be able to read one sentence and leave satisfied, and an
 * AI answer engine should find the quotable form at the top rather than assembled from
 * four paragraphs. The body underneath is what stops the page being thin - it adds a
 * specific, and it says when the answer does not apply.
 *
 * The pager is the other half of the design. These pages are short by intent, so the
 * cheapest next action has to be the next question in the same cluster.
 */
export function AnswerPageShell({
  answer,
  topic,
  pillar,
  related,
  prev,
  next,
  jsonLd,
}: {
  answer: Answer;
  topic: Topic | undefined;
  pillar: SeoPage | undefined;
  related: ReadonlyArray<Answer>;
  prev: Answer | null;
  next: Answer | null;
  jsonLd: string;
}) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <Nav anchorBase="/" />
      <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
        <Breadcrumbs
          trail={[
            { name: "Home", href: "/" },
            { name: "Answers", href: "/answers" },
            ...(topic ? [{ name: topic.title, href: "/answers" }] : []),
            { name: answer.question, href: answerPath(answer.slug) },
          ]}
        />

        <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
          {answer.question}
        </h1>

        <p className="mt-5 border-l-4 border-green-600 pl-4 text-lg font-medium leading-relaxed">
          {answer.short}
        </p>

        <div className="mt-10 flex flex-col gap-10">
          {answer.body.map((s) => (
            <SectionBody key={s.id} section={s} level={2} />
          ))}
        </div>

        {pillar ? (
          <p className="mt-10 rounded-xl border bg-[var(--muted)] p-4 text-sm leading-relaxed">
            Part of our guide to{" "}
            <Link href={seoPath(pillar.slug)} className="font-medium underline underline-offset-4">
              {pillar.shortName.toLowerCase()}
            </Link>
            .
          </p>
        ) : null}

        {related.length > 0 ? (
          <section className="mt-10 border-t pt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Related questions
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link href={answerPath(r.slug)} className="underline underline-offset-4">
                    {r.question}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <nav aria-label="More answers" className="mt-10 grid gap-3 border-t pt-8 sm:grid-cols-2">
          {prev ? (
            <Link href={answerPath(prev.slug)} className="rounded-xl border p-4 hover:bg-[var(--muted)]">
              <span className="text-xs text-[var(--muted-foreground)]">Previous</span>
              <span className="mt-1 block text-sm font-medium">{prev.question}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={answerPath(next.slug)}
              className="rounded-xl border p-4 text-right hover:bg-[var(--muted)] sm:text-right"
            >
              <span className="text-xs text-[var(--muted-foreground)]">Next</span>
              <span className="mt-1 block text-sm font-medium">{next.question}</span>
            </Link>
          ) : null}
        </nav>

        <SeoCta
          heading="See it on your own enquiries"
          body="Build a scorecard, point your traffic at it, and find out how many of your enquiries clear your own bar."
        />

        <p className="mt-10 text-xs text-[var(--muted-foreground)]">
          Last updated {answer.updatedAt}
        </p>
      </main>
      <Footer />
    </>
  );
}
