import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "riddle-alternative",
  kind: "comparison",
  intent:
    "Someone using Riddle for embedded quizzes and polls on a content site who needs a standalone qualification funnel for enquiries rather than engagement content inside articles.",
  primaryKeyword: "riddle quiz alternative",
  secondaryKeywords: [
    "riddle alternative for lead qualification",
    "alternative to riddle quiz maker",
    "riddle vs assess360",
  ],
  title: "Riddle Alternative for Lead Qualification",
  description:
    "How Assess360 differs from an embeddable quiz maker: a hosted qualification funnel on your own domain that filters enquiries and reports the outcome to your ads.",
  h1: "Assess360 as a Riddle alternative",
  shortName: "vs Riddle",
  factsCheckedOn: "2026-10-06",
  lede:
    "Embedded quizzes and polls are engagement content: they sit inside a page someone is already reading and give them something to do. A qualification funnel is a destination of its own, because an ad has to point somewhere and that somewhere has to make a decision.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "scorecard", "meta-ads-lead-qualification"],
  sections: [
    {
      id: "embed-vs-destination",
      heading: "An embed inside content, or a page an ad can point at",
      answer:
        "Engagement content keeps a reader on the page; a qualification funnel is the page, and everything on it exists to reach a verdict.",
      paragraphs: [
        "That difference drives the detail. A funnel needs its own URL on your domain, a result page that differs by band, and no navigation inviting people to wander off before they finish.",
      ],
      bullets: [],
    },
    {
      id: "verdict",
      heading: "What the funnel has to produce",
      answer:
        "A score, a verdict against your threshold, a routed respondent, and a signal back to whoever paid for the click.",
      paragraphs: [
        "If you are running paid traffic to it, that last one is what separates a funnel that improves over time from one that simply reports what happened.",
      ],
      bullets: [
        "Hosted on your own domain, with no surrounding page to leak attention",
        "A gate before the opt-in, so a rejection leaves no record",
        "Bands, weighted scoring and a qualified threshold",
        "Qualified-only conversion events and an exclusion audience",
      ],
    },
  ],
  cta: {
    heading: "Give the ad somewhere to land",
    body: "A hosted qualification funnel on your own domain, with a verdict at the end of it.",
  },
};
