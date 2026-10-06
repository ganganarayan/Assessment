import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "jotform-alternative",
  kind: "comparison",
  intent:
    "Someone running enquiry intake on Jotform who has the submissions but still has to triage them by hand, and wants the triage built into the form itself.",
  primaryKeyword: "jotform alternative",
  secondaryKeywords: [
    "jotform alternative for lead qualification",
    "alternative to jotform",
    "jotform vs assess360",
  ],
  title: "Jotform Alternative for Lead Qualification",
  description:
    "How Assess360 differs from Jotform: enquiries are scored against your criteria and filtered before they become leads, instead of arriving as submissions to triage.",
  h1: "Assess360 as a Jotform alternative",
  shortName: "vs Jotform",
  factsCheckedOn: "2026-10-06",
  lede:
    "Jotform is a general-purpose form builder with an enormous range, and it will collect anything you can think to ask. What it leaves you with is a queue of submissions, and somebody has to decide which of them deserve an hour.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "qualify-leads-before-sales-call", "lead-scoring"],
  sections: [
    {
      id: "triage",
      heading: "The cost is in the triage, not the form",
      answer:
        "Building the form takes an afternoon; reading every submission to find the good ones takes a slice of every week, forever.",
      paragraphs: [
        "Scoring moves that judgement to the moment the scorecard is built. The rule is written once, applied identically to everyone, and the enquiries arrive already ranked instead of arriving as a queue.",
      ],
      bullets: [],
    },
    {
      id: "before-not-after",
      heading: "Filtering before the record exists",
      answer:
        "A disqualifying answer can end the visit before contact details are captured, which a form cannot do because capture is the point.",
      paragraphs: [
        "That difference matters for data as much as for time: no record means nothing to store, nothing to secure, and nothing entering a nurture sequence that was built for buyers.",
      ],
      bullets: [
        "Points per answer and weighted categories, not conditional routing alone",
        "Bands that give each score a written meaning for the respondent",
        "A result page worth answering honestly for",
        "Qualification reported to the ad platform that paid for the click",
      ],
    },
    {
      id: "fit",
      heading: "When a form builder is the right answer",
      answer:
        "For registrations, bookings, uploads, internal processes and anything where every submission is wanted.",
      paragraphs: [
        "Most of what a form builder is used for has nothing to do with qualification, and for those jobs a broad form tool is the better choice by a distance.",
      ],
      bullets: [],
    },
  ],
  cta: {
    heading: "Move the triage into the form",
    body: "Score the answers, set the line, and let the enquiries arrive sorted rather than stacked.",
  },
};
