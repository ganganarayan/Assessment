import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "scorecard",
  kind: "pillar",
  topicId: "scorecards",
  intent:
    "Someone who has heard the term and wants to know what a scorecard actually is as a marketing asset, what the respondent sees, and whether it is different from the quiz or form they already run.",
  primaryKeyword: "online scorecard",
  secondaryKeywords: [
    "assessment scorecard",
    "lead qualification scorecard",
    "scorecard software",
  ],
  title: "Online Scorecards: How They Work",
  description:
    "What an online scorecard is, what the respondent sees at the end, and why the result page is the part that decides whether people answer honestly.",
  h1: "Assess360 — online scorecards",
  shortName: "Online scorecards",
  lede:
    "An online scorecard asks a set of questions, scores the answers against criteria you set, and shows the respondent where they stand. The exchange is the whole mechanism: they answer honestly because the result is only useful if they do.",
  updatedAt: "2026-10-02",
  internalLinks: ["lead-qualification-software", "lead-scoring", "assessment-software"],
  sections: [
    {
      id: "the-exchange",
      heading: "Why a scorecard gets honest answers",
      answer:
        "Because the respondent is answering for their own benefit, not yours — an inflated answer only corrupts the result they came for.",
      paragraphs: [
        "This is the structural difference from a form, and it is worth dwelling on. On a lead form, there is no cost to overstating a budget or a timeline; the only consequence lands on you. On a scorecard, the person is being measured against something, and a dishonest answer produces a reading they know is wrong.",
        "It is not a lie detector. People still round up. But the incentive points the other way for the first time, and that shows up in the quality of what you collect.",
      ],
      bullets: [],
    },
    {
      id: "result-page",
      heading: "What the result page has to show",
      answer:
        "A score, what that score means in words, and one clear next step — in that order, and specific enough that it could not have been written for someone else.",
      paragraphs: [
        "A result that reads as generic undoes the exchange retroactively: the respondent concludes the questions were a formality. Bands are what prevent this. Each score range gets its own written interpretation and its own recommendation, so a low scorer and a high scorer leave with genuinely different pages.",
      ],
      bullets: [
        "The score, shown plainly rather than hidden behind an email gate",
        "A named band with its own interpretation, not one paragraph for everyone",
        "Where they lost points, so the number is explicable",
        "One next step that matches the band, including for people who do not qualify",
      ],
    },
    {
      id: "hosting",
      heading: "Hosted, not rebuilt",
      answer:
        "A scorecard needs a URL of its own, because ads, email and social all need somewhere to send people that is not your homepage.",
      paragraphs: [
        "Rebuilding the experience inside your own site is the common instinct and it usually costs more than it returns — the scoring, the branching and the per-respondent result page all have to be reimplemented. A hosted link on your own domain gets the branding without the rebuild.",
      ],
      bullets: [],
    },
    {
      id: "how-assess360-does-it",
      heading: "How Assess360 does it",
      answer:
        "Every scorecard is hosted on one link with a per-respondent result page, banded interpretations and an optional branded PDF — on your own domain when you want it.",
      paragraphs: [
        "The result page is built from bands rather than one template, so a low scorer and a high scorer leave with genuinely different pages: their own score, where the points went, and a next step that matches where they landed instead of the sale you would prefer.",
        "Custom domain and branding mean the whole experience runs as yours, with our badge removed, so the scorecard reads as part of your business rather than a tool you rented for the afternoon.",
      ],
      bullets: [
        "One hosted link — nothing to rebuild on your own site",
        "A per-respondent result page with score, breakdown and next step",
        "Named bands, each with its own writing and recommendation",
        "A branded PDF the respondent can keep",
        "Your domain, your colours, your logo, no Assess360 badge",
      ],
    },
  ],
  cta: {
    heading: "Build the scorecard and see the result page your leads would get",
    body:
      "Set the questions, the bands and the next step for each one, then share a single hosted link.",
  },
};
