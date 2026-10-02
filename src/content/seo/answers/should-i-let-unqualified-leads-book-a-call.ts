import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "should-i-let-unqualified-leads-book-a-call",
  question: "Should I let unqualified leads book a call?",
  short:
    "Usually no, but only if you give them something genuinely useful instead, because a dead end is what turns a polite rejection into a bad review.",
  topicId: "pre-call-qualification",
  primaryKeyword: "should unqualified leads book a call",
  secondaryKeywords: ["turning down unqualified leads", "disqualifying leads politely"],
  related: ["how-do-i-qualify-leads-before-a-sales-call", "what-is-a-good-lead-score-threshold"],
  updatedAt: "2026-10-02",
  body: [
    {
      id: "the-alternative",
      heading: "What to offer instead",
      answer:
        "The honest version of what you would have told them on the call, plus whichever of a resource, a lower-commitment offer or a referral actually fits.",
      paragraphs: [
        "Someone told plainly that they are not a fit, and why, and what to do about it, rarely resents it - and a surprising number come back when their circumstances change. Someone who books a call and is let down gently after twenty minutes remembers it differently.",
      ],
      bullets: [],
    },
    {
      id: "the-exception",
      heading: "When to let them through anyway",
      answer:
        "When the score is borderline, when they are an unusual case your questions were not built for, or when your calendar genuinely has room.",
      paragraphs: [
        "Scoring is a model and models are wrong at the edges. Treat the threshold as a default rather than a gate you cannot open, and give someone a way to say the questions did not capture their situation. The cost of a rare unnecessary call is far lower than the cost of a systematically closed door.",
      ],
      bullets: [],
    },
  ],
};
