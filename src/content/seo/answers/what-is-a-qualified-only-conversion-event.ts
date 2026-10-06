import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "what-is-a-qualified-only-conversion-event",
  question: "What is a qualified-only conversion event?",
  short:
    "It is a conversion you report to the ad platform only when a lead passes your qualification criteria, so delivery optimises towards buyers rather than towards form fillers.",
  topicId: "meta-ads",
  primaryKeyword: "qualified only conversion event",
  secondaryKeywords: [
    "optimise ads for qualified leads",
    "what counts as a qualified lead for ads",
    "conversion event lead quality",
  ],
  related: ["how-do-i-exclude-unqualified-leads-from-meta-ads", "why-do-my-ads-produce-unqualified-leads"],
  updatedAt: "2026-10-06",
  body: [
    {
      id: "what-changes",
      heading: "What changes when the event moves",
      answer:
        "The campaign stops looking for people who submit and starts looking for people who qualify, because that is now the behaviour it is being rewarded for.",
      paragraphs: [
        "Delivery systems optimise towards whoever completes the nominated event. Nominating submission makes submission the goal, and submission is cheap for a person to perform and worthless to a business on its own.",
        "Moving the event to qualification is a one-line change in intent and a large change in who the ads reach, because the model is now matching against a different, smaller, more valuable set of completers.",
      ],
      bullets: [],
    },
    {
      id: "what-it-costs",
      heading: "Expect the reported volume to fall",
      answer:
        "Fewer events will be reported and the cost per event will rise, because what is being counted is rarer and worth more.",
      paragraphs: [
        "This is the part that stops most advertisers, usually in the first week. Cost per lead is the metric on the dashboard, and it gets worse by design. The metric that should be watched instead is cost per qualified lead, or better, cost per sale, both of which improve.",
        "Give the campaign time to re-learn. The system needs a number of the new events before delivery settles, and judging it before then compares a learning phase with a steady state.",
      ],
      bullets: [],
    },
    {
      id: "how-assess360",
      heading: "How Assess360 does it",
      answer:
        "The gate runs before the opt-in, so qualification is known before a lead exists, and the completion event is only sent for the people who passed.",
      paragraphs: [
        "Because the event is sent from the server at the moment the score is computed, it is counted whether or not the visitor's browser allowed a pixel to run, and it carries a shared event id so the browser and server versions deduplicate rather than double count.",
      ],
      bullets: [],
    },
  ],
};
