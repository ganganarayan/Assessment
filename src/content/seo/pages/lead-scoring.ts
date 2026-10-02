import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "lead-scoring",
  kind: "pillar",
  topicId: "lead-scoring",
  intent:
    "Someone who already captures leads and now wants to rank them. Often deciding between the scoring built into their CRM and a dedicated tool, and unsure how to pick points and weights without guessing.",
  primaryKeyword: "lead scoring software",
  secondaryKeywords: [
    "lead scoring tool",
    "automated lead scoring",
    "prospect scoring",
    "qualification scoring",
  ],
  title: "Lead Scoring Software: Points and Weights",
  description:
    "How lead scoring works in practice - points per answer, category weights and the qualified threshold - and why fit and behavioural scoring answer different things.",
  h1: "Assess360: lead scoring your ad platform can learn from",
  shortName: "Lead scoring software",
  lede:
    "Lead scoring turns answers into a number you can sort by. The mechanics are simple - points per answer, weights per category, a threshold for qualified - and nearly all the value lies in choosing them deliberately rather than copying a template.",
  updatedAt: "2026-10-02",
  internalLinks: ["lead-qualification-software", "scorecard"],
  sections: [
    {
      id: "fit-vs-behaviour",
      heading: "Assess360 scores fit, not how interested somebody looks",
      answer:
        "Fit scoring asks whether this person is the kind of customer you want; behavioural scoring asks how interested they appear to be. Blending them into one number hides which question you answered.",
      paragraphs: [
        "A prospect who opened six emails and sat through a webinar can score highly on behaviour while being a poor fit. Marketing automation tools tend to score behaviour because behaviour is what they can observe. An assessment scores fit, because it asks directly.",
        "If you want both, keep them as two numbers. A single blended score is the kind of metric that looks sophisticated and cannot be acted on, because a high one does not tell you which half it came from.",
      ],
      bullets: [],
    },
    {
      id: "choosing-points",
      heading: "How to set your Assess360 points without guessing",
      answer:
        "Start from customers you already have: take your five best and five worst, and set the points so the scoring would have separated them.",
      paragraphs: [
        "This is more reliable than reasoning forward from criteria, because it tests the scoring against outcomes you can already see. If your proposed weights score a current bad-fit customer as qualified, the weights are wrong - and you have learned that in an afternoon instead of a quarter.",
      ],
      bullets: [
        "List your five best and five worst customers",
        "Answer the assessment the way each of them would have",
        "Adjust points and weights until the two groups separate cleanly",
        "Put the threshold between them, not at a round number",
      ],
    },
    {
      id: "weights",
      heading: "Assess360 weights categories, so one answer can outrank the rest",
      answer:
        "Weights decide which category can overrule the others, and that is usually a bigger lever than any single answer's points.",
      paragraphs: [
        "If budget is weighted at twice everything else, a prospect cannot compensate for having none by answering every other question well - which is normally the behaviour you want. Scoring without weights implicitly claims every category matters equally, and that is almost never true.",
      ],
      bullets: [],
    },
    {
      id: "how-assess360-does-it",
      heading: "Assess360 sends the score back to the platform that bought the click",
      answer:
        "Points per answer, weights per category, and named bands that turn the total into a message and a next step - then the qualified ones are reported back to Meta as a conversion.",
      paragraphs: [
        "That last step is the one most scoring setups never reach. A score that lives only in your CRM tells your reps who to call; a score reported back to the ad platform tells the algorithm who to go and find. Until the platform knows which leads were any good, it keeps optimising toward whatever you last called a conversion, which for most accounts is still a form submission.",
        "A durable first-party identifier travels with each event, including sends to your own CRM, which lifts match quality without collecting anything extra about the person.",
      ],
      bullets: [
        "Points per answer, so a near-miss scores differently from a dealbreaker",
        "Category weights, so what predicts fit can outweigh the rest",
        "Bands that map a number to a message and a recommended next step",
        "A qualified-only conversion event, deduplicated across Pixel and CAPI",
        "First-party match keys carried on every event",
      ],
    },
  ],
  cta: {
    heading: "Test your scoring against customers you already know",
    body:
      "Build the scoring, run your best and worst accounts through it, and adjust until it separates them before any real traffic arrives.",
  },
};
