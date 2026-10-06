import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "outgrow-alternative",
  kind: "comparison",
  intent:
    "A marketer evaluating Outgrow for interactive content who actually needs one qualification funnel that filters and reports lead quality, rather than a suite of calculators and quizzes.",
  primaryKeyword: "outgrow alternative",
  secondaryKeywords: [
    "outgrow alternative for lead qualification",
    "alternative to outgrow",
    "outgrow vs assess360",
  ],
  title: "Outgrow Alternative for Lead Qualification",
  description:
    "How Assess360 differs from Outgrow: one qualification funnel done thoroughly, with a gate before the opt-in and qualified-only reporting.",
  h1: "Assess360 as an Outgrow alternative",
  shortName: "vs Outgrow",
  factsCheckedOn: "2026-10-06",
  lede:
    "Outgrow is an interactive content platform: calculators, quizzes, assessments, polls, recommendations. Assess360 does one of those things and takes it further, because qualification is not a content format, it is a decision about who gets a sales conversation.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "meta-ads-lead-qualification", "assessment-software"],
  sections: [
    {
      id: "breadth-vs-depth",
      heading: "Breadth of formats, or depth on one job",
      answer:
        "A content suite gives you many ways to engage an audience; a qualification engine gives you one way to decide who is worth your time.",
      paragraphs: [
        "If the brief is a quarter of interactive content across several campaigns, breadth is genuinely useful. If the brief is that sales keeps getting bad leads from paid traffic, breadth is not the constraint and depth on one funnel is.",
      ],
      bullets: [],
    },
    {
      id: "the-depth",
      heading: "What depth on qualification looks like",
      answer:
        "A gate that prevents a lead existing, scoring with weights and bands, manual review for edge cases, and a signal back to the ad platform.",
      paragraphs: [
        "Those four steps are one loop rather than four features. The gate decides who continues, the score ranks whoever did, review catches what a rule cannot judge, and the signal teaches the campaign to find more of the people who passed.",
      ],
      bullets: [
        "Disqualifying answers end the run with no lead, no submission and no CRM row",
        "Weighted categories, bands, and a threshold that defines qualified",
        "Free-text screening questions kept for a human to read",
        "A server-side qualified-only event plus an exclusion audience",
      ],
    },
    {
      id: "fit",
      heading: "Which one fits your problem",
      answer:
        "Choose the suite if you need many interactive pieces; choose this if one funnel is deciding who your sales team talks to.",
      paragraphs: [
        "There is no contradiction in using both. A calculator on a blog post and a qualification funnel behind an ad are different jobs with different success measures.",
      ],
      bullets: [],
    },
  ],
  cta: {
    heading: "Build the qualification funnel properly",
    body: "One scorecard, a gate in front of it, and the ad platform told which leads were worth the click.",
  },
};
