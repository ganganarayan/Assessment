import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/context";
import {
  getAnswer,
  getTopic,
  getPage,
  resolveAnswers,
  answerNeighbours,
} from "@/lib/seo/registry";
import { answerGraph } from "@/lib/seo/schema";
import { AnswerPageShell } from "@/features/seo/components/answer-page-shell";
import { platformPageMetadata } from "@/lib/seo/site";

/**
 * One question, one URL.
 *
 * The description is the answer's own one-sentence form rather than a written-for-search
 * summary - it is already the shortest true statement of the page, and writing a second
 * one would only create something to keep in sync.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const answer = getAnswer(slug);
  if (!answer) return {};
  return platformPageMetadata({
    title: answer.question,
    description: answer.short.slice(0, 160),
    path: `/answers/${answer.slug}`,
  });
}

export default async function AnswerRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (await getCurrentTenant()) notFound();

  const answer = getAnswer(slug);
  if (!answer) notFound();

  const topic = getTopic(answer.topicId);
  const { prev, next } = answerNeighbours(answer);
  const jsonLd = await answerGraph(answer, topic?.title ?? "Answers");

  return (
    <AnswerPageShell
      answer={answer}
      topic={topic}
      pillar={topic ? getPage(topic.pillarSlug) : undefined}
      related={resolveAnswers(answer.related)}
      prev={prev}
      next={next}
      jsonLd={jsonLd}
    />
  );
}
