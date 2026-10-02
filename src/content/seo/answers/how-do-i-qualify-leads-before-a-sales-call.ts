import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "how-do-i-qualify-leads-before-a-sales-call",
  question: "How do I qualify leads before a sales call?",
  short:
    "Put the questions a rep would ask in the first five minutes of the call into a scored assessment that runs before the call is booked, and let the score decide who gets one.",
  topicId: "lead-qualification",
  primaryKeyword: "qualify leads before a sales call",
  secondaryKeywords: ["qualify prospects before demo", "qualify leads before booking"],
  related: ["what-is-lead-qualification-software", "why-do-my-ads-produce-unqualified-leads"],
  updatedAt: "2026-10-02",
  body: [
    {
      id: "which-questions",
      heading: "Which questions to move earlier",
      answer:
        "Take the three or four questions that most often end a first call badly, and ask them before the call exists.",
      paragraphs: [
        "Most teams already know what these are — the budget question, the authority question, the timing question, the one about whether the prospect has a problem you actually solve. They get asked late because asking them early feels rude. In an assessment it does not: the prospect is answering to get a result, not to be screened.",
      ],
      bullets: [],
    },
    {
      id: "what-to-do-with-the-score",
      heading: "What to do with the ones who do not qualify",
      answer:
        "Send them somewhere useful rather than nowhere — a resource, a lower-commitment offer, or an honest explanation of who the service is for.",
      paragraphs: [
        "This is the step most teams skip, and it is the one that makes the whole thing defensible. A prospect who is told plainly that they are not a fit, and why, rarely resents it. One who is quietly dropped after booking a call does.",
      ],
      bullets: [],
    },
  ],
};
