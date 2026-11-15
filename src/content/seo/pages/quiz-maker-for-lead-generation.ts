import type { SeoPage } from "@/lib/seo/types";
import { lacks } from "../capabilities";

export const page: SeoPage = {
  slug: "quiz-maker-for-lead-generation",
  kind: "pillar",
  topicId: "quiz-funnels",
  intent:
    "A business owner looking for a quiz maker or quiz builder to generate leads, who does not yet use the term lead qualification and wants to know whether they need a gate in front of the quiz.",
  primaryKeyword: "quiz maker for lead generation",
  secondaryKeywords: ["quiz maker for business", "quiz builder", "scored quiz maker", "quiz with qualification gate"],
  title: "Quiz Maker for Lead Generation, With or Without a Gate",
  description:
    "Build scored quizzes where every answer carries points and each band gets its own result, with an optional qualification gate in front for paid traffic.",
  h1: "A quiz maker that scores every answer, and can screen before it starts",
  shortName: "Quiz maker",
  lede:
    "Assess360 builds scored quizzes for businesses: every answer carries points, the total lands in a band you name, and each band gets its own result page. Add a qualification gate in front when wrong-fit people cost you money, or leave it off when you just want a scored quiz.",
  updatedAt: "2026-11-15",
  internalLinks: ["lead-qualification-quiz", "scorecard", "lead-scoring"],
  sections: [
    {
      id: "two-ways",
      heading: "Two ways to run an Assess360 quiz",
      answer:
        "Quiz only, where people answer, get a score and see their result, or gate then quiz, where a few short questions come first and wrong-fit people are turned away before they become leads.",
      paragraphs: [
        "The gate is a choice per funnel, not a plan you have to buy into. A self-assessment or readiness check usually runs without one. A funnel fed by paid ads, where a person calls every lead back, usually runs with one, and then only qualified people are reported to Meta.",
      ],
      bullets: [
        "Quiz only: self-assessments, readiness checks and scorecards people take for their own answer",
        "Gate, then quiz: paid traffic, sales calls, limited seats or anything where a wrong lead costs money",
      ],
    },
    {
      id: "what-you-get",
      heading: "What every Assess360 quiz includes",
      answer:
        "Points on every answer, a weight on each question, named result bands with their own message and next step, and a result page, report and branding of your own.",
      paragraphs: [],
      bullets: [
        "Points per answer, a weight per question and a subscore per category",
        "Result bands you name, each with its own message and next step",
        "Skip-and-jump logic in the one-question-per-page mode",
        "A result page builder, a branded PDF report and an AI-written report",
        "Twenty-four templates to start from, or paste your own questions in",
        "Your own domain and branding, built for phones first",
      ],
    },
  ],
  limits: {
    intro:
      "A quiz maker built for judging fit gives up some of what list-building quiz tools offer. These are the gaps, stated plainly so you can rule it out quickly if one of them matters to you.",
    items: lacks("questionTypes", "embeds", "googleAds", "stripe", "freePlan", "volume"),
  },
  cta: {
    heading: "Build your first scored quiz",
    body: "Start from a template or paste your questions in, and decide per funnel whether it needs a gate in front.",
  },
};
