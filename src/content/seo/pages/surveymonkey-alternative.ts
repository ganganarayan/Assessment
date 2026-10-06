import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "surveymonkey-alternative",
  kind: "comparison",
  intent:
    "Someone who reached for a survey tool to screen enquiries and found it answers questions about a population rather than making a decision about one person.",
  primaryKeyword: "surveymonkey alternative",
  secondaryKeywords: [
    "surveymonkey alternative for lead qualification",
    "alternative to surveymonkey for leads",
    "surveymonkey vs assess360",
  ],
  title: "SurveyMonkey Alternative for Lead Qualification",
  description:
    "How Assess360 differs from a survey tool: it judges one respondent at a time against your criteria and acts on the verdict, rather than reporting on a population.",
  h1: "Assess360 as a SurveyMonkey alternative",
  shortName: "vs SurveyMonkey",
  factsCheckedOn: "2026-10-06",
  lede:
    "Survey platforms are built to learn about a group: aggregate the responses, read the distribution, draw a conclusion. Qualification is the opposite shape. It judges one person at a time, immediately, and then does something about it.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "assessment-software", "scorecard"],
  sections: [
    {
      id: "population-vs-person",
      heading: "A population answer, or a decision about one person",
      answer:
        "Survey tools are optimised for analysis after the fact; qualification has to produce a verdict while the respondent is still on the page.",
      paragraphs: [
        "That timing requirement is what drives almost every difference. The score has to be computed instantly, the result has to be shown immediately, and the routing has to happen before the person leaves.",
      ],
      bullets: [],
    },
    {
      id: "acting-on-it",
      heading: "Acting on the answer, not reporting it",
      answer:
        "Show the respondent their band, rank them for the sales team, and tell the ad platform the outcome - all before they close the tab.",
      paragraphs: [
        "A survey export can tell you that 40 per cent of enquiries fall below your threshold. It cannot stop the other 60 per cent waiting behind them in the queue, which is the thing that actually costs money.",
      ],
      bullets: [],
    },
  ],
  cta: {
    heading: "Decide, do not survey",
    body: "Score each enquiry as it arrives, show the person where they stand, and route them on the spot.",
  },
};
