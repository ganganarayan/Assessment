import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "can-ai-write-my-assessment-questions",
  question: "Can AI write my assessment questions?",
  short:
    "AI can write a usable first draft of the questions and answer options in minutes, but the scoring behind them encodes your judgement about what a good customer looks like and has to be yours.",
  topicId: "assessment-software",
  primaryKeyword: "can ai write assessment questions",
  secondaryKeywords: ["ai question generation", "ai generated quiz questions"],
  related: ["how-long-should-an-assessment-be", "what-is-an-online-assessment"],
  updatedAt: "2026-10-02",
  body: [
    {
      id: "what-it-is-good-at",
      heading: "What generation is genuinely good for",
      answer:
        "Getting past the blank page, and surfacing the obvious questions you would have reached eventually anyway.",
      paragraphs: [
        "A generated draft is usually competent and slightly generic, which is exactly what a first draft should be. The work that follows — cutting the questions that would never change a decision, rewording the ones that read like a form — is faster than starting from nothing.",
      ],
      bullets: [],
    },
    {
      id: "what-it-cannot-know",
      heading: "What it cannot know",
      answer:
        "Which answers should score well, because that depends on which of your past customers turned out to be worth having.",
      paragraphs: [
        "A model can infer that budget matters to a B2B service business. It cannot know that your best accounts have consistently come in under a budget threshold you would have screened out, or that one industry you expected to be ideal has never renewed. That knowledge lives in your outcomes, and it is what the scoring is for.",
      ],
      bullets: [],
    },
  ],
};
