import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "what-questions-should-i-ask-to-qualify-a-lead",
  question: "What questions should I ask to qualify a lead?",
  short:
    "The ones whose answers would change whether you take the meeting, which for most businesses means the problem, the scale, the timing and who decides.",
  topicId: "pre-call-qualification",
  primaryKeyword: "questions to qualify a lead",
  secondaryKeywords: ["lead qualifying questions", "sales qualification questions"],
  related: ["how-do-i-qualify-leads-before-a-sales-call", "should-i-let-unqualified-leads-book-a-call"],
  updatedAt: "2026-10-02",
  body: [
    {
      id: "the-four",
      heading: "The four that earn their place",
      answer:
        "Problem, scale, timing and authority - asked in the respondent's language rather than as a checklist borrowed from a sales methodology.",
      paragraphs: [
        "Frameworks like BANT are fine as a reminder of what to cover and poor as a script. Nobody wants to be asked to confirm their budget authority. They will happily tell you their role, and their role answers the same question without the interrogation.",
      ],
      bullets: [
        "What are you trying to fix, in your own words?",
        "How big is it - volume, spend, headcount, whatever applies?",
        "When do you need this solved by?",
        "What is your role in the decision?",
      ],
    },
    {
      id: "what-to-leave-out",
      heading: "What to leave out",
      answer:
        "Anything you are collecting because it would be nice to know, and anything a rep can find in thirty seconds.",
      paragraphs: [
        "Company size and industry are usually both: they look like qualification and in most businesses they change nothing. Every question you cut raises the completion rate of the ones that do matter, which is a straight trade in your favour.",
      ],
      bullets: [],
    },
  ],
};
