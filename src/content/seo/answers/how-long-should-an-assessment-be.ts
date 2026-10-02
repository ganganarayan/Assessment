import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "how-long-should-an-assessment-be",
  question: "How long should an assessment be?",
  short:
    "Long enough that the result is worth having and no longer, which in practice means asking only the questions whose answers would change the outcome or the advice.",
  topicId: "assessment-software",
  primaryKeyword: "how long should an assessment be",
  secondaryKeywords: ["assessment question count", "ideal quiz length"],
  related: ["what-is-an-online-assessment", "can-ai-write-my-assessment-questions"],
  updatedAt: "2026-10-02",
  body: [
    {
      id: "the-real-test",
      heading: "The test to apply to every question",
      answer:
        "Ask what you would do differently with each possible answer - if the honest reply is nothing, the question is costing you completions for free.",
      paragraphs: [
        "Most over-long assessments are long because of questions that felt useful to add and have never once changed a decision. Company size, when you serve every size. Industry, when your advice does not vary by industry. These are the ones to cut first, because cutting them costs nothing at all.",
      ],
      bullets: [],
    },
    {
      id: "branching-changes-the-answer",
      heading: "Branching changes the calculation",
      answer:
        "With conditional logic the question that matters is how many questions each person sees, not how many exist.",
      paragraphs: [
        "An assessment can hold thirty questions and ask any given respondent nine of them. The experienced length is what drives completion, so a branching assessment can be more thorough and feel shorter at the same time.",
      ],
      bullets: [],
    },
  ],
};
