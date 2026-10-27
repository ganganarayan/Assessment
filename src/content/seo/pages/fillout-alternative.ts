import type { SeoPage } from "@/lib/seo/types";
import { caps, lacks } from "../capabilities";

export const page: SeoPage = {
  slug: "fillout-alternative",
  kind: "comparison",
  intent:
    "Someone using Fillout for forms with conditional logic and calculations who now wants the logic to make a qualification decision and report it, rather than only branch the questions, and who needs to know what Fillout's breadth was doing for them.",
  primaryKeyword: "fillout alternative",
  secondaryKeywords: [
    "fillout alternative for lead qualification",
    "alternative to fillout",
    "fillout vs assess360",
  ],
  title: "Fillout Alternative for Lead Qualification",
  description:
    "Assess360 against Fillout: both score and branch, only one gates before the opt-in and sends a server-side qualified event, and Fillout has fifty field types.",
  h1: "Assess360 as a Fillout alternative",
  shortName: "vs Fillout",
  factsCheckedOn: "2026-10-27",
  lede:
    "Fillout is a very capable form builder and it already does more of this than most: fifty-odd field types, calculation fields, per-option scores, outcome quizzes, multiple ending pages. The gap is at the two ends. Nothing stops a wrong-fit respondent before the record exists, and the Meta integration is a browser pixel on the Business plan with no Conversions API behind it.",
  updatedAt: "2026-10-27",
  internalLinks: ["lead-qualification-software", "lead-scoring", "meta-ads-lead-qualification"],
  sections: [
    {
      id: "branching-vs-scoring",
      heading: "Branching shapes the form, scoring judges the answers",
      answer:
        "A branch changes the next question; a score changes what happens to the person after the last one. Fillout does both, and so does this.",
      paragraphs: [
        "It is worth not overstating the difference, because Fillout is not a tool that cannot score. It has named calculation fields, per-option scores on dropdowns, multiple choice and picture choice, and an outcome quiz that routes to a different ending page by total score or most-frequent answer. If scoring is all you need, you already have it.",
        "What differs is the shape of the scoring. Here a weight belongs to a question, each category reports its own score with its own named bands, and the band ranges are validated so two cannot overlap. In Fillout the equivalent is several calculation fields acting as subscores and page-logic comparisons standing in for bands. Both arrive at a number; one of them is an object you configure and the other is a set of rules you maintain.",
      ],
      bullets: [],
    },
    {
      id: "verdict",
      heading: "Where the verdict goes",
      answer:
        "To the respondent as a banded result, to your team as a ranked lead, and to the ad platform as the conversion it should optimise on.",
      paragraphs: [
        "That last destination is the one Fillout does not reach, and it is where the money is for anyone buying traffic. Their Meta integration takes a pixel ID and fires two client-side events, it is on the Business plan and above, and their own documentation mentions no Conversions API, no access token and no dataset. Google Ads is a manual CSV upload of offline conversions inside a paid add-on, with automatic upload described as planned.",
        "So the campaign only ever learns that somebody submitted. It never learns that somebody qualified, and it is never told who to stop chasing.",
      ],
      bullets: [
        "A weight per question and a score per category, with named bands on the percentage",
        "A gate before the opt-in, so a rejection leaves no record and costs no quota",
        "Server-side qualified-only conversion events, deduplicated with the pixel, on the $39 plan",
        "An exclusion audience built from the people turned away, carrying no personal data",
      ],
    },
    {
      id: "collection-vs-qualification",
      heading: "Collection against qualification",
      answer: "Fillout is excellent at getting structured answers into a database, and it is cheap. That is a different job from deciding who is worth a call.",
      paragraphs: [
        "A generous free tier is a good deal when responses are the thing you want, and Fillout's is unusually generous: a thousand a month, unlimited forms, unlimited seats, conditional logic included. It quietly becomes a worse deal when most of those responses are not worth having. A thousand free submissions of which a hundred matter is nine hundred rows somebody has to sort, and the sorting is not free.",
        "The native Airtable, Notion and SmartSuite connections are a real reason to stay, and so is the scheduling, the signature field and the REST API on every plan. If your operation runs out of one of those, weigh it heavily.",
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
      "Fillout covers all of this too, several lines of it on cheaper plans than ours. The list is here because an alternative that could not hold the ordinary form work would be something you bolt on rather than something you move to.",
    items: caps(
      "points",
      "weights",
      "bands",
      "logic",
      "pacing",
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
      "Fillout is the broader and, at the entry level, the cheaper product. Everything in the first half of this list is something it has and we do not, and the free plan with a thousand responses a month is a genuinely hard thing to argue against.",
    items: lacks(
      "questionTypes",
      "fileUpload",
      "esign",
      "embeds",
      "prefill",
      "languages",
      "zapier",
      "api",
      "abTesting",
      "questionStats",
      "aiQuestions",
      "stripe",
      "compliance",
      "freePlan",
      "volume",
      "annual",
    ),
  },
  comparison: {
    competitor: "Fillout",
    source:
      "read from their own pricing page and help centre on 27 October 2026. Their own pages are inconsistent about the top tier's name and reference a plan the pricing cards do not show, so check the current page before relying on a tier name",
    rows: [
      {
        label: "Gate runs before the opt-in",
        us: "Yes. A failed gate stores no lead, no submission and no result, and fires an exclusion event.",
        them: "Page logic can route to an ending before the email page, but no disqualify flow is documented and in-progress responses are stored.",
      },
      {
        label: "Are disqualified visitors metered?",
        us: "Never. Only qualified completions count, and previews are unmetered.",
        them: "Not documented either way. Their pricing, partial-submission and fair-use pages never say whether a partial counts.",
      },
      {
        label: "Server-side Conversions API",
        us: "Yes, on every paid plan including the $39 one, deduplicated against the browser pixel.",
        them: "No. The Meta integration takes a pixel ID only, with no access token or dataset, and it is Business and Enterprise.",
      },
      {
        label: "Qualified-only conversion event",
        us: "Yes, as its own event, with an exclusion signal for everybody turned away.",
        them: "No. The pixel fires a page-viewed and a submitted event.",
      },
      {
        label: "Points per answer and calculations",
        us: "Points per option, a weight per question, and category subscores.",
        them: "Per-option scores on several field types, plus named calculation fields for number, text and duration. Theirs is the more flexible engine.",
        themWins: true,
      },
      {
        label: "Named score bands",
        us: "Named bands overall and per category, each with a message, validated against overlaps.",
        them: "Score ranges exist for outcome quizzes, but as manual page-logic comparisons rather than a band builder.",
      },
      {
        label: "More than one outcome page",
        us: "Yes, with band-specific content inside the page.",
        them: "Yes, multiple ending pages selected by page logic.",
        tie: true,
      },
      {
        label: "Conditional logic",
        us: "Answer-based skip, jump, converge and cascade into a different assessment.",
        them: "Field-level conditions, page logic, condition groups and skip connectors, on every plan including free.",
        tie: true,
      },
      {
        label: "Custom domain",
        us: "Yes, from $79/mo, with the certificate provisioned. Further domains $5 each.",
        them: "Yes, from Business at $75/mo, and exactly one per account on any plan.",
        tie: true,
      },
      {
        label: "Webhooks and export",
        us: "Signed webhooks with a durable retry queue, and CSV export on every plan.",
        them: "Webhooks on every plan, plus endpoints to create and remove them. Theirs reaches further.",
        tie: true,
      },
      {
        label: "Field types",
        us: "Two: single-select and free text.",
        them: "Fifty-one, including file upload, signature, matrix, ranking, star rating, slider, address, currency and voice recording.",
        themWins: true,
      },
      {
        label: "Embed in a page you already have",
        us: "No. The funnel is a hosted page on your own domain, distributed as a link.",
        them: "Inline, popup, full screen and slider, plus a QR code.",
        themWins: true,
      },
      {
        label: "API, Zapier and CRM connectors",
        us: "Two read endpoints on Agency, $249. No Zapier app, no named CRM connector.",
        them: "A REST API on every plan including free, Zapier and Make, and HubSpot, Salesforce, Pipedrive, Klaviyo and more.",
        themWins: true,
      },
      {
        label: "Seats",
        us: "One on the $39 plan, three on the $79 one.",
        them: "Unlimited seats on every plan, free included.",
        themWins: true,
      },
      {
        label: "Compliance paperwork",
        us: "None. No SOC 2, no DPA, no SSO.",
        them: "SOC 2 Type II, a standard DPA available on any plan with a published subprocessor list, and SAML SSO on Enterprise.",
        themWins: true,
      },
      {
        label: "Free plan and entry price",
        us: "No free plan. 14 days of the full product, then $39/mo for 150 qualified responses, billed monthly.",
        them: "Free forever with 1,000 responses a month, then Starter at $15/mo billed annually for 2,000.",
        themWins: true,
      },
    ],
  },
  betterWhen:
    "Fillout is the better buy on almost every axis except the two this product exists for. It is cheaper, it has fifty more field types, unlimited seats on every plan, a REST API on the free tier, Zapier and Make, scheduling, signatures, SOC 2 and a DPA, and a free plan that would cover most people's whole funnel. If you are not buying ads, or you are and you are content with a client-side pixel, stay where you are. Move only if the gate before the opt-in and a server-side qualified event are worth more to you than all of that.",
  faqs: [
    {
      q: "Fillout already does scoring and multiple outcomes. What is actually different?",
      a: "Two things, and neither is arithmetic. First, the gate runs on the first screen before any contact field, so a wrong-fit visitor leaves no stored response at all rather than an ending-page record. Second, the qualified completion is sent to Meta server-side as its own event while everybody turned away feeds an exclusion audience. Fillout's Meta integration is a pixel ID on the Business plan, and its own docs mention no Conversions API.",
    },
    {
      q: "Is Fillout not much cheaper?",
      a: "Yes. A free plan with a thousand responses a month, then fifteen dollars billed annually for two thousand, against thirty-nine for a hundred and fifty here. We are not going to argue the subscription. The argument only works if a wrong-fit enquiry costs you an hour of selling time, because then the expensive number is the calls, not the plan.",
    },
    {
      q: "What would I lose by moving?",
      a: "Forty-nine field types, file uploads, the signature field, the four embed modes, URL prefill and hidden fields, the REST API, Zapier and Make, the CRM connectors, unlimited seats, SOC 2 and the DPA, scheduling, and the free plan. That is a long list, and on most of it Fillout is simply the better product.",
    },
    {
      q: "Can I move my Fillout form across?",
      a: "Single-select and free-text questions move by pasting them into the plain-text importer. Calculation fields, matrices, uploads and signatures do not, because we have no equivalent. Send us the live link and we will rebuild it as a scored funnel with a gate in front of it, free, then take it live with you on one 30-minute call.",
    },
  ],
  cta: {
    heading: "Give the logic a verdict to produce",
    body: "Build the same form as a scored funnel with a gate in front of it, and send the qualified ones to your ad account server-side.",
  },
};
