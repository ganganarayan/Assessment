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
  factsCheckedOn: "2026-10-09",
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
    {
      id: "collection-vs-qualification",
      heading: "Collection against qualification",
      answer: "Fillout is excellent at getting structured answers into a database. That is a different job from deciding who is worth a call.",
      paragraphs: [
        "A generous free tier is a good deal when responses are the thing you want. It quietly becomes a worse deal when most of them are not: a thousand free submissions of which a hundred matter is nine hundred rows somebody has to sort, and the sorting is not free.",
        "The native Notion and Airtable connections are a real reason to stay, and we would not pretend otherwise. If your whole operation runs out of one of those, weigh that heavily.",
      ],
      bullets: [
        "Disqualified visitors leave no lead record, so nothing reaches your CRM to be cleaned out later",
        "A qualified-only conversion event, so the algorithm optimises toward people who passed rather than people who typed fast",
        "An exclusion audience that grows by itself, so you stop paying to reach the people you just turned away",
      ],
    },
  ],
  comparison: {
    competitor: "Fillout",
    source: "read from their own pricing page on 9 October 2026. Several vendors price by region, so the figure you are shown may differ",
    rows: [
    {
      label: "Gate runs before the opt-in",
      us: "Yes, before the opt-in. A failed gate stores no lead, no submission and no result.",
      them: "No pre-opt-in gate. Conditional logic within the form.",
    },
    {
      label: "Are disqualified visitors metered?",
      us: "Never. Only qualified responses count against the plan.",
      them: "Responses count against the plan.",
    },
    {
      label: "Weighted category scoring",
      us: "Yes. Weighted categories, a weighted total, and named result bands.",
      them: "Calculations and logic. No weighted categories with bands.",
    },
    {
      label: "Qualified-only conversion event",
      us: "Yes. Qualified completions fire their own conversion event.",
      them: "No qualified-only conversion event.",
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
      them: "Custom domain on the Business plan.",
    },
    {
      label: "Entry price",
      us: "$39/mo, or $32 billed annually.",
      them: "Free for 1,000 responses a month, then $15/mo Starter for 2,000. Hard to beat on price.",
      themWins: true,
    },
    ],
  },
  betterWhen:
    "Fillout is fast, modern, generous on its free plan and plugged straight into Notion and Airtable. If your data already lives in one of those and you want a good-looking form writing into it, it is an obvious choice and costs almost nothing. Choose it when the job is collection: getting structured answers into a database with the least friction possible.",
  faqs: [
    {
      q: "Fillout's free plan takes 1,000 responses. Why pay anything?",
      a: "Because the responses are not the cost. A thousand collected enquiries of which eighty are worth a call is a successful month for a form builder and an expensive one for you. If your leads are free to ignore, Fillout's free plan genuinely is the right answer.",
    },
    {
      q: "Can Fillout send a qualified-only event to Meta?",
      a: "No. Every submission reports the same way, so the algorithm keeps optimising toward people who complete forms rather than people who qualify.",
    },
    {
      q: "Will my Notion and Airtable workflow still work?",
      a: "Through webhooks and CSV export rather than a native integration. If the native Notion or Airtable connection is the thing you value most, that is a real reason to stay.",
    },
  ],
  cta: {
    heading: "Give the logic a verdict to produce",
    body: "Score the answers, define qualified, and send that outcome to your team and your campaigns.",
  },
};
