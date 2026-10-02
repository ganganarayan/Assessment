import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "how-do-i-qualify-leads-before-a-sales-call",
  question: "How do I qualify leads before a sales call?",
  short:
    "Put the questions a rep would ask in the first five minutes of the call into a scored assessment that runs before the call is booked, and let the score decide who gets one.",
  topicId: "pre-call-qualification",
  primaryKeyword: "how do i qualify leads before a sales call",
  secondaryKeywords: ["pre-call screening questions", "qualify leads automatically"],
  related: [
    "what-questions-should-i-ask-to-qualify-a-lead",
    "should-i-let-unqualified-leads-book-a-call",
    "why-do-my-ads-produce-unqualified-leads",
  ],
  updatedAt: "2026-10-02",
  body: [
    {
      id: "which-questions",
      heading: "Which questions to move earlier",
      answer:
        "Take the three or four questions that most often end a first call badly, and ask them before the call exists.",
      paragraphs: [
        "Most teams already know what these are - the budget question, the authority question, the timing question, the one about whether the prospect has a problem you actually solve. They get asked late because asking them early feels rude. Inside an assessment it is not: the prospect is answering to get a result, not to be screened.",
      ],
      bullets: [],
    },
    {
      id: "what-to-do-with-the-score",
      heading: "What to do with the ones who do not qualify",
      answer:
        "Send them somewhere useful rather than nowhere - a resource, a lower-commitment offer, or an honest explanation of who the service is for.",
      paragraphs: [
        "This is the step most teams skip, and it is the one that makes the whole thing defensible. A prospect told plainly that they are not a fit, and why, rarely resents it. One quietly dropped after booking a call does.",
      ],
      bullets: [],
    },
  ],
};
