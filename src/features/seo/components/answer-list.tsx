import Link from "next/link";
import type { Answer } from "@/lib/seo/types";
import { answerPath } from "@/lib/seo/urls";

/**
 * The cluster's answers, in full - every one, not a curated handful.
 *
 * Each row is the question and its one-sentence answer, so the list reads as a usable
 * FAQ on its own, and the link is for the reader who wants the rest. Listing the whole
 * cluster is what gives every answer page an internal link from a page that ranks.
 */
export function AnswerList({ answers, heading }: { answers: ReadonlyArray<Answer>; heading: string }) {
  if (answers.length === 0) return null;

  return (
    <section id="answers" className="scroll-mt-20">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{heading}</h2>
      <dl className="mt-6 flex flex-col divide-y border-y">
        {answers.map((a) => (
          <div key={a.slug} className="py-5">
            <dt className="font-semibold">
              <Link href={answerPath(a.slug)} className="hover:underline">
                {a.question}
              </Link>
            </dt>
            <dd className="mt-2 leading-relaxed text-[var(--muted-foreground)]">
              {a.short}{" "}
              <Link
                href={answerPath(a.slug)}
                className="whitespace-nowrap font-medium text-green-700 hover:underline dark:text-green-500"
              >
                Read more →
              </Link>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
