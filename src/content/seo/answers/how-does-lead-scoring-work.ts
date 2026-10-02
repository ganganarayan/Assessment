import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "how-does-lead-scoring-work",
  question: "How do I score leads so sales only calls the right ones?",
  short:
    "You give each possible answer points, weight the categories against each other, and set a threshold, so the leads above it are the only ones your reps are asked to call.",
  topicId: "lead-scoring",
  primaryKeyword: "how to score leads",
  secondaryKeywords: ["lead scoring explained", "how lead scores are calculated"],
  related: ["what-is-a-good-lead-score-threshold", "what-is-lead-qualification-software"],
  updatedAt: "2026-10-02",
  body: [
    {
      id: "worked-example",
      heading: "A worked example",
      answer:
        "Three categories - budget, timing, fit - weighted 3, 2 and 1 produce a very different ranking from the same answers weighted equally.",
      paragraphs: [
        "Take two prospects. One has budget and no urgency; the other is urgent with no budget. Weighted equally they tie, and your reps have learned nothing. Weight budget at three and the first ranks clearly higher - which may or may not be right for your business, but it is now a decision you made rather than one the default made for you.",
      ],
      bullets: [],
    },
    {
      id: "where-it-goes-wrong",
      heading: "Where scoring usually goes wrong",
      answer:
        "Scores that were set once from intuition and never checked against what actually happened to those leads.",
      paragraphs: [
        "Scoring is a hypothesis about which answers predict good customers. Like any hypothesis it should be checked: look at the leads that converted and the ones that wasted everybody's time, and see whether the score separated them. If it did not, the points are decoration.",
      ],
      bullets: [],
    },
  ],
};
