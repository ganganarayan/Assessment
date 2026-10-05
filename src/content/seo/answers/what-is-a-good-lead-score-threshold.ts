import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "what-is-a-good-lead-score-threshold",
  question: "What is a good lead score threshold?",
  short:
    "There is no universal number, and the right one is wherever your own best and worst customers separate when you score them retrospectively.",
  topicId: "lead-scoring",
  primaryKeyword: "what is a good lead score threshold",
  secondaryKeywords: ["lead score cutoff", "qualified lead threshold"],
  related: ["how-does-lead-scoring-work", "should-i-let-unqualified-leads-book-a-call"],
  updatedAt: "2026-10-02",
  body: [
    {
      id: "why-not-a-round-number",
      heading: "Why 70 out of 100 is a bad default",
      answer:
        "Round thresholds get chosen because they feel natural, not because anything in the data changes there.",
      paragraphs: [
        "Score ten customers you know the outcome for and the useful cutoff tends to sit somewhere unlovely, like 58 or 64, because that is where the two groups actually part. A threshold inherited from a template is a guess wearing a number.",
      ],
      bullets: [],
    },
    {
      id: "which-error-to-prefer",
      heading: "Decide which mistake you would rather make",
      answer:
        "A lower threshold lets through more time-wasters; a higher one turns away people you could have helped - and the right trade depends on what a sales hour costs you.",
      paragraphs: [
        "A team with spare capacity should set the bar lower and accept some noise. A team whose calendar is the bottleneck should set it higher and accept that some good leads are sent elsewhere. The number is a capacity decision as much as a quality one.",
      ],
      bullets: [],
    },
  ],
};
