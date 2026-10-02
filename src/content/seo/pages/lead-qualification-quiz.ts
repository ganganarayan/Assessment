import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "lead-qualification-quiz",
  kind: "pillar",
  topicId: "quiz-funnels",
  intent:
    "A marketer who has seen quiz funnels work for list growth and wants to know whether the same format can qualify leads rather than just collect them. Comparing quiz builders against something built for scoring.",
  primaryKeyword: "lead qualification quiz",
  secondaryKeywords: ["quiz funnel software", "interactive assessment", "quiz funnel"],
  title: "Lead Qualification Quiz: Beyond List Growth",
  description:
    "How a lead qualification quiz differs from a list-building quiz, what to ask, and why most quiz funnels optimise for the wrong outcome.",
  h1: "Assess360 - a lead qualification quiz that sorts, not collects",
  shortName: "Lead qualification quiz",
  lede:
    "A lead qualification quiz uses the quiz format for a different job: not to grow a list, but to decide who is worth talking to. The format is identical and the design decisions are nearly opposite.",
  updatedAt: "2026-10-02",
  internalLinks: ["lead-qualification-software", "scorecard", "lead-scoring"],
  sections: [
    {
      id: "two-jobs",
      heading: "The same format, two opposite jobs",
      answer:
        "A list-building quiz is designed so that everyone finishes; a qualification quiz is designed so that the right people finish and the wrong people find out early that they should not.",
      paragraphs: [
        "That single difference cascades through every design choice. List-building quizzes keep questions light and flattering because a drop-off is a lost subscriber. Qualification quizzes ask the uncomfortable questions early, because a drop-off there is a saved sales hour.",
        "Neither is wrong. They are simply not the same tool, and running the first while expecting the second is the commonest disappointment with quiz funnels.",
      ],
      bullets: [],
    },
    {
      id: "what-to-ask",
      heading: "What to ask in a qualification quiz",
      answer:
        "The questions whose answers would change whether you take the meeting - and ask them early enough that they do their job.",
      paragraphs: [
        "Burying the budget question at position nine means you have paid for eight questions of engagement from people you were never going to serve. Putting it early feels risky and is usually the single highest-value change available.",
      ],
      bullets: [
        "What the person is actually trying to fix, in their words",
        "Scale - team size, volume, spend - whatever determines whether you can help",
        "Timing, because a good fit in eighteen months is not this quarter's lead",
        "Authority, asked as a role question rather than an interrogation",
      ],
    },
    {
      id: "optimisation",
      heading: "Why completion rate is the wrong headline metric",
      answer:
        "A qualification quiz that improves its completion rate may simply be getting better at finishing with people you cannot help.",
      paragraphs: [
        "The metric that matters is qualified completions, and it moves differently - it can rise while total completions fall, which looks like a regression on every dashboard built for list growth. Decide which number you are optimising before you start testing, or you will test your way back into a list-building quiz.",
      ],
      bullets: [],
    },
    {
      id: "how-assess360-does-it",
      heading: "How Assess360 does it",
      answer:
        "The gate runs before the quiz, so a wrong-fit visitor never becomes a lead - and the ad platform is told about both outcomes rather than only the completions.",
      paragraphs: [
        "A quiz that reports every completion teaches Meta to find quiz-completers. Assess360 reports a distinct qualified-completion event instead, so optimisation follows the people who cleared your bar, while a disqualified visitor fires an exclusion signal that builds a never-show-again audience.",
        "Back-button and repeat protection matter more here than anywhere else: a visitor who has been rejected cannot refresh or navigate back for a second attempt at the gate with better answers.",
      ],
      bullets: [
        "A qualification gate ahead of the quiz itself",
        "Branching, so each respondent sees the shortest relevant path",
        "A qualified-only optimisation event rather than every completion",
        "Exclusion and retargeting audiences built automatically",
        "Back-button and repeat locking on the gate",
      ],
    },
  ],
  cta: {
    heading: "Build a quiz that sorts rather than collects",
    body:
      "Ask the questions that decide whether a lead is worth a call, and score them so the answer arrives before anyone books one.",
  },
};
