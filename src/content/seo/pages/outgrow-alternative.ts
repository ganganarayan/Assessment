import type { SeoPage } from "@/lib/seo/types";
import { caps, lacks } from "../capabilities";

export const page: SeoPage = {
  slug: "outgrow-alternative",
  kind: "comparison",
  intent:
    "A marketer evaluating Outgrow for interactive content who actually needs one qualification funnel that filters and reports lead quality, and who wants to know what Outgrow's breadth and its Business-tier pricing really buy.",
  primaryKeyword: "outgrow alternative",
  secondaryKeywords: [
    "outgrow alternative for lead qualification",
    "alternative to outgrow",
    "outgrow vs assess360",
  ],
  title: "Outgrow Alternative for Lead Qualification",
  description:
    "Assess360 against Outgrow: one qualification funnel done thoroughly on a $39 plan, against an interactive content suite whose ads toolkit sits on Business.",
  h1: "Assess360 as an Outgrow alternative",
  shortName: "vs Outgrow",
  factsCheckedOn: "2026-10-27",
  lede:
    "Outgrow is an interactive content platform: calculators, quizzes, assessments, polls, recommendations, with scientific formulas and Excel math import behind them. Two things decide this comparison. Its own documented answer for server-side Meta tracking is to POST to the Graph API yourself with cURL, and every piece a paid-ads funnel needs sits on its Business plan.",
  updatedAt: "2026-10-27",
  internalLinks: ["lead-qualification-software", "meta-ads-lead-qualification", "assessment-software"],
  sections: [
    {
      id: "breadth-vs-depth",
      heading: "Breadth of formats, or depth on one job",
      answer:
        "A content suite gives you many ways to engage an audience; a qualification engine gives you one way to decide who is worth your time.",
      paragraphs: [
        "If the brief is a quarter of interactive content across several campaigns, breadth is genuinely useful and Outgrow has more of it than anything else here. If the brief is that sales keeps getting bad leads from paid traffic, breadth is not the constraint and depth on one funnel is.",
        "There is a pricing shape worth understanding before anything else. Custom domain, branding removal, webhooks and the PDF builder all land together on Outgrow's Business plan, published at $720 a month or $600 billed annually. Their Essentials tier reaches those only through a qualification-gated small-business discount. So the honest comparison is not $39 against $22, it is $39 against the tier where the funnel actually works.",
      ],
      bullets: [],
    },
    {
      id: "the-depth",
      heading: "What depth on qualification looks like",
      answer:
        "A gate that prevents a lead existing, scoring with weights and bands, manual review for edge cases, and a server-side signal back to the ad platform.",
      paragraphs: [
        "Those four steps are one loop rather than four features. The gate decides who continues, the score ranks whoever did, review catches what a rule cannot judge, and the signal teaches the campaign to find more of the people who passed.",
        "Outgrow reaches the first three in some form. The fourth is where it stops: its own help article on tracking conversions in Ads Manager tells you to POST to the Graph API with Postman or cURL, which is a workaround rather than a feature, with no in-app token field and no tier attached to it. There is also an overage behaviour worth reading before you scale a campaign, because their FAQ says analytics tracking and integrations halt until you buy an add-on.",
      ],
      bullets: [
        "Disqualifying answers end the run with no lead, no submission and no CRM row",
        "A weight per question, a score per category, and named bands that define qualified",
        "Free-text screening questions kept for a human to read",
        "A server-side qualified-only event plus an exclusion audience, on the $39 plan",
      ],
    },
    {
      id: "fit",
      heading: "Which one fits your problem",
      answer:
        "Choose the suite if you need many interactive pieces, formulas, or accessibility and HIPAA answers; choose this if one funnel is deciding who your sales team talks to.",
      paragraphs: [
        "There is no contradiction in using both. A calculator on a blog post and a qualification funnel behind an ad are different jobs with different success measures.",
        "Outgrow also answers questions we cannot. It has a published WCAG 2.0 self-assessment and an accessibility toggle, a HIPAA claim with a BAA on request, SOC 2, SAML SSO, four payment gateways, native A/B testing, save-and-continue, language localisation and over a thousand integrations including SAP, Eloqua and Marketo. We have none of that.",
      ],
      bullets: [],
    },
    {
      id: "which-number-is-costing-you",
      heading: "Breadth against depth, and which one is costing you",
      answer: "Outgrow does many content formats well. This does one, and does the part after it from the server rather than from a cURL command.",
      paragraphs: [
        "The decision is not which tool is better, because they are not aimed at the same number. Outgrow is aimed at how much interactive content you can put on a site. This is aimed at how many of the enquiries that content produces are worth a call.",
        "If you cannot name what a wrong-fit call costs you, breadth is worth more and you should buy breadth. If you can name it, and it is an hour of somebody senior, the arithmetic has already been done for you, and so has the comparison between $39 and $600.",
      ],
      bullets: [
        "Disqualified visitors leave no lead record, so nothing reaches your CRM to be cleaned out later",
        "A qualified-only conversion event, so the algorithm optimises toward people who passed rather than people who typed fast",
        "An exclusion audience that grows by itself, so you stop paying to reach the people you just turned away",
      ],
    },
  ],
  parity: {
    intro:
      "Outgrow does all of this too, and in several places with a wider set of options. The list matters here because the price difference is large enough that the question becomes what the cheaper tool fails to do, and this is the answer: none of it.",
    items: caps(
      "points",
      "weights",
      "bands",
      "logic",
      "pacing",
      "freetext",
      "resultPage",
      "pdf",
      "resultLink",
      "redirect",
      "aiReport",
      "captureOrder",
      "domain",
      "branding",
      "templates",
      "importer",
      "resume",
      "retakes",
      "webhooks",
      "export",
      "submissions",
      "emailSending",
      "pixel",
      "stats",
      "utm",
      "seats",
    ),
  },
  limits: {
    intro:
      "Outgrow is a far wider platform and it holds answers to questions we simply cannot answer, particularly on compliance and accessibility. Everything in this list that it covers is a real reason to choose it instead.",
    items: lacks(
      "questionTypes",
      "fileUpload",
      "embeds",
      "languages",
      "abTesting",
      "zapier",
      "api",
      "stripe",
      "aiQuestions",
      "compliance",
      "accessibility",
      "freePlan",
      "volume",
      "annual",
    ),
  },
  comparison: {
    competitor: "Outgrow",
    source:
      "read from their own pricing page, features page and support docs on 27 October 2026. Their pricing page shows two unlabelled figures per plan beside a monthly and annual toggle, so the mapping below is inferred from the discount they advertise",
    rows: [
      {
        label: "Gate runs before the opt-in",
        us: "Yes. A failed gate stores no lead, no submission and no result, and fires an exclusion event.",
        them: "Lead-form placement is configurable and logic can jump to an outcome, but no disqualify-and-suppress mode is documented.",
      },
      {
        label: "Are disqualified visitors metered?",
        us: "Never. Only qualified completions count, and previews are unmetered.",
        them: "The quota is lead-form submissions. Their FAQ describes an allocation for leads and visits, and partial counting is not documented.",
      },
      {
        label: "Server-side Conversions API",
        us: "Yes, on every paid plan including the $39 one, deduplicated against the browser pixel.",
        them: "Not as a feature. Their own article tells you to POST to the Graph API with Postman or cURL, with no in-app token field.",
      },
      {
        label: "Qualified-only conversion event",
        us: "Yes, as its own event, with an exclusion signal for everybody turned away.",
        them: "No. The native pixel integration tracks user events; a submission is a submission.",
      },
      {
        label: "What the ads toolkit costs",
        us: "$39/mo, with the gate, the pixel, the Conversions API, webhooks and the PDF all included.",
        them: "Custom domain, branding removal, webhooks and PDF all land on Business, published at $720/mo or $600 billed annually.",
      },
      {
        label: "Points per answer and formulas",
        us: "Points per option and a weight per question. No formula field.",
        them: "Outcome mapping with a weight per option, plus simple, advanced and scientific formulas and Excel math import. Far ahead of us.",
        themWins: true,
      },
      {
        label: "Named score bands and category subscores",
        us: "Named bands overall and per category, validated against overlaps.",
        them: "Graded assessments calculate a score with conditional messaging, but weighted categories and manual bands are not documented features.",
      },
      {
        label: "More than one outcome page",
        us: "Yes, with band-specific content inside the page.",
        them: "Yes, an outcome quiz with a result page each, plus unlimited conditional result messages.",
        tie: true,
      },
      {
        label: "Conditional logic",
        us: "Answer-based skip, jump, converge and cascade into a different assessment.",
        them: "Branching and logic jump with unlimited branches and AND/OR conditions, from their Freelancer tiers up.",
        tie: true,
      },
      {
        label: "Answers survive a closed tab",
        us: "Answers autosave, and re-entering the same email picks the run back up.",
        them: "Save and continue, so a respondent can resume later.",
        tie: true,
      },
      {
        label: "Webhooks and export",
        us: "Signed webhooks with a durable retry queue on every paid plan, and CSV export never gated.",
        them: "Webhooks with a documented JSON payload, on Business.",
      },
      {
        label: "Field and format variety",
        us: "Two question types, one format: a scored assessment.",
        them: "Around eleven field types including sliders, opinion scale, rating and date, plus calculators, polls, recommendations, chatbots and live content.",
        themWins: true,
      },
      {
        label: "Embed in a page you already have",
        us: "No. The funnel is a hosted page on your own domain, distributed as a link.",
        them: "Full-screen hosted, inline iframe, popup or slide-in, and a chatbot-style window.",
        themWins: true,
      },
      {
        label: "A/B testing and languages",
        us: "Neither. One language per funnel, and two variants means two funnels.",
        them: "Native A/B testing including multiple versions of one piece, plus language localisation.",
        themWins: true,
      },
      {
        label: "Integrations and API",
        us: "Two read endpoints on Agency, $249. No Zapier app, no named CRM connector.",
        them: "Native Zapier and a Make guide, HubSpot, Salesforce, Marketo, Pardot, Eloqua, SAP and more, with API access as an enterprise add-on.",
        themWins: true,
      },
      {
        label: "Accessibility, HIPAA and compliance",
        us: "None. No WCAG work, no BAA, no SOC 2, no SSO.",
        them: "A published WCAG 2.0 A/AA self-assessment with an accessibility toggle, a HIPAA claim with a BAA on request, SOC 2, and SAML SSO.",
        themWins: true,
      },
      {
        label: "Free plan",
        us: "None. 14 days of the full product, then $39/mo for 150 qualified responses.",
        them: "A free forms-and-surveys tier with 100 leads a month, and Freelancer from $22/mo monthly or $14 annually with 250 leads.",
        themWins: true,
      },
    ],
  },
  betterWhen:
    "Outgrow is the right choice if you need interactive content as a category rather than one funnel: calculators with real formulas, recommendations, polls, chatbots, four payment gateways, A/B testing, localisation and a thousand integrations. It is also the only product on this list with a published accessibility self-assessment and a HIPAA answer, both of which we lack entirely. Choose Assess360 when one funnel decides who your sales team talks to, and when you would rather not pay Business-tier pricing to get a custom domain and a webhook.",
  faqs: [
    {
      q: "Does Outgrow support the Meta Conversions API?",
      a: "Not as a product feature. Their own support article on tracking conversions in Ads Manager walks you through POSTing to the Graph API with Postman or cURL, including example payloads. That is a developer workaround, not an integration: there is no token field in the app, no tier attached to it, and nothing deduplicating it against the browser pixel. Here the Conversions API is on the entry plan and deduplicated by default.",
    },
    {
      q: "Is Outgrow not much cheaper than this?",
      a: "At the entry tier, yes, and we would not pretend otherwise. But custom domain, branding removal, webhooks and the PDF builder all sit on their Business plan, published at $720 a month or $600 billed annually, and their Essentials tier reaches them only via a qualification-gated small-business discount. If you need a funnel on your own domain that can post a lead to your own endpoint, compare against that tier, not the cheapest one.",
    },
    {
      q: "What would I lose by moving?",
      a: "The calculator formats and the formula engine, nine or so field types, the four embed modes, A/B testing, localisation, Zapier and Make, a thousand integrations including Salesforce and Marketo, four payment gateways, SAML SSO, SOC 2, the HIPAA answer and the published accessibility self-assessment, and a free tier. On breadth this is not a close comparison.",
    },
    {
      q: "Can I move my Outgrow content across?",
      a: "A scored assessment moves if its questions are single-select or free text, by pasting them into the plain-text importer. A calculator does not, because there is no formula field here. Send us the live link and we will rebuild the assessment with a gate in front of it, free, then take it live with you on one 30-minute call.",
    },
  ],
  cta: {
    heading: "Build the qualification funnel properly",
    body: "One funnel, a gate in front of it, and a server-side qualified event, on the plan where it is all included.",
  },
};
