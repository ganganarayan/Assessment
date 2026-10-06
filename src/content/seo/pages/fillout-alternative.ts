import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "fillout-alternative",
  kind: "comparison",
  intent:
    "Someone using Fillout for forms with conditional logic who now wants the logic to make a qualification decision and report it, rather than only branch the questions.",
  primaryKeyword: "fillout alternative",
  secondaryKeywords: [
    "fillout alternative for lead qualification",
    "alternative to fillout",
    "fillout vs assess360",
  ],
  title: "Fillout Alternative for Lead Qualification",
  description:
    "How Assess360 differs from Fillout: branching decides what to ask next, scoring decides what the answers are worth and who qualifies.",
  h1: "Assess360 as a Fillout alternative",
  shortName: "vs Fillout",
  factsCheckedOn: "2026-10-06",
  lede:
    "Conditional logic answers the question what should I ask next. Qualification answers a different one: what is this person worth to us, and should the conversation happen at all. The second needs scoring, a threshold, and somewhere to send the verdict.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "lead-scoring", "meta-ads-lead-qualification"],
  sections: [
    {
      id: "branching-vs-scoring",
      heading: "Branching shapes the form, scoring judges the answers",
      answer:
        "A branch changes the next question; a score changes what happens to the person after the last one.",
      paragraphs: [
        "Both are useful and Assess360 does both - answer-based routing is in the builder - but routing alone never produces a number you can sort a day's enquiries by, or a line that defines qualified.",
      ],
      bullets: [],
    },
    {
      id: "verdict",
      heading: "Where the verdict goes",
      answer:
        "To the respondent as a banded result, to your team as a ranked lead, and to the ad platform as the conversion it should optimise on.",
      paragraphs: [
        "That last destination is the one almost no form tool reaches, and it is where the money is for anyone buying traffic: the campaign only improves if it is told which clicks turned into qualified people.",
      ],
      bullets: [
        "Weighted categories and bands, not just a total",
        "A gate before the opt-in, so a rejection leaves no record",
        "Server-side qualified-only conversion events, deduplicated with the pixel",
        "An exclusion audience built from the people turned away",
      ],
    },
  ],
  cta: {
    heading: "Give the logic a verdict to produce",
    body: "Score the answers, define qualified, and send that outcome to your team and your campaigns.",
  },
};
