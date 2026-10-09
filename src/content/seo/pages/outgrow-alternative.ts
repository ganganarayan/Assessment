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
  factsCheckedOn: "2026-10-09",
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
    {
      id: "which-number-is-costing-you",
      heading: "Breadth against depth, and which one is costing you",
      answer: "Outgrow does many content formats well. This does one, and does the part after it that nothing else does.",
      paragraphs: [
        "The decision is not which tool is better, because they are not aimed at the same number. Outgrow is aimed at how much interactive content you can put on a site. This is aimed at how many of the enquiries that content produces are worth a call.",
        "If you cannot name what a wrong-fit call costs you, breadth is worth more and you should buy breadth. If you can name it, and it is an hour of somebody senior, the arithmetic has already been done for you.",
      ],
      bullets: [
        "Disqualified visitors leave no lead record, so nothing reaches your CRM to be cleaned out later",
        "A qualified-only conversion event, so the algorithm optimises toward people who passed rather than people who typed fast",
        "An exclusion audience that grows by itself, so you stop paying to reach the people you just turned away",
      ],
    },
  ],
  comparison: {
    competitor: "Outgrow",
    source: "read from their own pricing page on 9 October 2026. Several vendors price by region, so the figure you are shown may differ",
    rows: [
    {
      label: "Gate runs before the opt-in",
      us: "Yes, before the opt-in. A failed gate stores no lead, no submission and no result.",
      them: "No pre-opt-in gate. Content is interactive, then the form arrives.",
    },
    {
      label: "Are disqualified visitors metered?",
      us: "Never. Only qualified responses count against the plan.",
      them: "Leads count against the plan.",
    },
    {
      label: "Weighted category scoring",
      us: "Yes. Weighted categories, a weighted total, and named result bands.",
      them: "Yes, and a wide range of calculator and quiz formats besides.",
      themWins: true,
    },
    {
      label: "Qualified-only conversion event",
      us: "Yes. Qualified completions fire their own conversion event.",
      them: "No distinct qualified-only conversion event.",
    },
    {
      label: "Server-side exclusion audience",
      us: "Yes. Server-side exclusion audience via the Conversions API.",
      them: "No server-side exclusion audience.",
    },
    {
      label: "First-party match keys",
      us: "Yes, on every Pixel and CAPI event.",
      them: "Standard pixel integrations.",
    },
    {
      label: "Custom domain",
      us: "Yes, from $79/mo.",
      them: "Available on higher plans.",
    },
    {
      label: "Entry price",
      us: "$39/mo, or $32 billed annually.",
      them: "$22/mo on the entry freelancer plan, or $14 billed annually, rising steeply through the tiers.",
    },
    ],
  },
  betterWhen:
    "Outgrow does far more content formats than we do: calculators, recommendations, polls, chatbots, giveaways. If your problem is that you need interactive content of several kinds across a marketing site, it is a stronger choice and a much broader product. Choose it when breadth is the requirement and when every lead the content produces is one you actually want.",
  faqs: [
    {
      q: "Outgrow has calculators and we use those. Does Assess360?",
      a: "No. We do one format, a gated scorecard, and nothing else. If calculators and recommendation quizzes are part of your marketing then Outgrow covers ground we deliberately do not.",
    },
    {
      q: "Why would I use a narrower tool?",
      a: "Because the narrow thing is the thing that costs you money. A calculator that produces a hundred leads you cannot sell to is a successful calculator and an expensive month. If that is not your problem, the breadth is worth more than the gate.",
    },
    {
      q: "Can I run both?",
      a: "Yes, and several people do. Outgrow for the top-of-funnel content, this for the one funnel that feeds the sales calendar and the ad account.",
    },
  ],
  cta: {
    heading: "Build the qualification funnel properly",
    body: "One scorecard, a gate in front of it, and the ad platform told which leads were worth the click.",
  },
};
