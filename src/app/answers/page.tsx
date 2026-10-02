import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/context";
import { TOPICS, answersForTopic, getPage } from "@/lib/seo/registry";
import { answersIndexGraph } from "@/lib/seo/schema";
import { Nav } from "@/components/marketing/Nav";
import { Footer } from "@/components/marketing/Footer";
import { Breadcrumbs } from "@/features/seo/components/breadcrumbs";
import { SeoCta } from "@/features/seo/components/seo-cta";
import { platformPageMetadata } from "@/lib/seo/site";
import { answerPath, seoPath } from "@/lib/seo/urls";

export const metadata: Metadata = platformPageMetadata({
  title: "Answers",
  description:
    "Short, direct answers about lead qualification, scoring and assessments — one question per page, each answered in a sentence before the detail.",
  path: "/answers",
});

/**
 * The knowledge-base index: every question, grouped by cluster, each with its
 * one-sentence answer visible.
 *
 * Showing the answers rather than only the questions makes the index useful in its own
 * right — a reader can get what they came for without a click — and it gives every answer
 * page an internal link from a page that is itself linked from the pillars.
 */
export default async function AnswersIndex() {
  if (await getCurrentTenant()) notFound();

  const clusters = TOPICS.map((t) => ({
    topic: t,
    pillar: getPage(t.pillarSlug),
    answers: answersForTopic(t.id),
  })).filter((c) => c.answers.length > 0);

  const jsonLd = await answersIndexGraph();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <Nav anchorBase="/" />
      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <Breadcrumbs trail={[{ name: "Home", href: "/" }, { name: "Answers", href: "/answers" }]} />

        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Answers</h1>
        <p className="mt-5 text-lg leading-relaxed text-[var(--muted-foreground)]">
          One question per page, answered in a sentence before the detail. Written for the
          questions people actually type, not the ones a brochure wants to answer.
        </p>

        <div className="mt-12 flex flex-col gap-12">
          {clusters.map(({ topic, pillar, answers }) => (
            <section key={topic.id}>
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{topic.heading}</h2>
              <p className="mt-2 leading-relaxed text-[var(--muted-foreground)]">{topic.blurb}</p>
              {pillar ? (
                <p className="mt-2 text-sm">
                  <Link href={seoPath(pillar.slug)} className="underline underline-offset-4">
                    Read the full guide to {pillar.shortName.toLowerCase()} →
                  </Link>
                </p>
              ) : null}

              <dl className="mt-6 flex flex-col divide-y border-y">
                {answers.map((a) => (
                  <div key={a.slug} className="py-5">
                    <dt className="font-semibold">
                      <Link href={answerPath(a.slug)} className="hover:underline">
                        {a.question}
                      </Link>
                    </dt>
                    <dd className="mt-2 leading-relaxed text-[var(--muted-foreground)]">
                      {a.short}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <SeoCta
          heading="Stop guessing which enquiries are worth a call"
          body="Build a scorecard, put it in front of real traffic, and see how many of your enquiries clear your own bar."
        />
      </main>
      <Footer anchorBase="/" />
    </>
  );
}
