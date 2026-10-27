import type { SeoPage } from "@/lib/seo/types";
import { caps, lacks } from "../capabilities";

export const page: SeoPage = {
  slug: "jotform-alternative",
  kind: "comparison",
  intent:
    "Someone running enquiry intake on Jotform who has the submissions but still has to triage them by hand, and wants the triage built into the form itself, without losing the field types and integrations Jotform gave them.",
  primaryKeyword: "jotform alternative",
  secondaryKeywords: [
    "jotform alternative for lead qualification",
    "alternative to jotform",
    "jotform vs assess360",
  ],
  title: "Jotform Alternative for Lead Qualification",
  description:
    "Assess360 against Jotform: a built-in scoring engine instead of hand-built calculation widgets, a gate before the opt-in, and what Jotform does better.",
  h1: "Assess360 as a Jotform alternative",
  shortName: "vs Jotform",
  factsCheckedOn: "2026-10-27",
  lede:
    "Jotform is a general-purpose form builder with an enormous range, and it can be made to score: calculation values per option, calculation widgets, conditions that switch the thank-you page. The difference is that here those are a scoring engine with weights and named bands rather than formulas you assemble yourself, and that the verdict is reported back to the ad account that paid for the click.",
  updatedAt: "2026-10-27",
  internalLinks: ["lead-qualification-software", "qualify-leads-before-sales-call", "lead-scoring"],
  sections: [
    {
      id: "triage",
      heading: "The cost is in the triage, not the form",
      answer:
        "Building the form takes an afternoon; reading every submission to find the good ones takes a slice of every week, forever.",
      paragraphs: [
        "Scoring moves that judgement to the moment the scorecard is built. The rule is written once, applied identically to everyone, and the enquiries arrive already ranked instead of arriving as a queue.",
        "Jotform can get to a score, and it is worth saying how: a calculation value per option, then one calculation widget per category with multiplication for the weights, then conditions tested against the total to change what is shown. That is Jotform's own documented method. It works, and it is a spreadsheet you maintain. Here the weights, the category subscores and the bands are fields in a builder with overlaps refused at save time, which is a different kind of object to own.",
      ],
      bullets: [],
    },
    {
      id: "before-not-after",
      heading: "Filtering before the record exists",
      answer:
        "A disqualifying answer can end the visit before contact details are captured, and the rejection becomes an ad-exclusion signal rather than a row.",
      paragraphs: [
        "Jotform is closer on this than most form builders, and it deserves the credit: it does not auto-save partial data, so somebody who never reaches Submit leaves nothing behind. What it has no concept of is a gate, which means routing can only happen once they reach the end, and anybody who does submit consumes a submission from your quota whether they were any good or not. Deleting or purging them does not give that count back.",
        "The gate here runs on the first screen, before the opt-in. A disqualifying answer creates no lead, no submission and no result, fires an exclusion event with no personal data in it, and is never metered.",
      ],
      bullets: [
        "Points per answer, a weight per question, and a score per category with its own bands",
        "Bands that give each score a written meaning for the respondent",
        "A result page worth answering honestly for",
        "Qualification reported to the ad platform that paid for the click, server-side",
      ],
    },
    {
      id: "fit",
      heading: "When a form builder is the right answer",
      answer:
        "For registrations, bookings, uploads, signatures, payments, internal processes and anything where every submission is wanted.",
      paragraphs: [
        "Most of what a form builder is used for has nothing to do with qualification, and for those jobs Jotform is the better choice by a distance. It has file uploads, matrices, star and scale ratings, an NPS widget, 130-odd languages, offline and kiosk collection on mobile, a signature product with an audit trail, and thirty-three payment gateways. We have single-select, free text, and a link.",
      ],
      bullets: [],
    },
    {
      id: "where-logic-stops",
      heading: "Where conditional logic stops being enough",
      answer: "Logic decides what a respondent sees. It cannot decide that they should not have become a lead, or tell Meta which ones were worth having.",
      paragraphs: [
        "Every serious form builder has branching, and it solves a real problem: not asking people questions that do not apply to them. What it cannot do is operate before the form, because by the time logic runs the person is inside it and usually identified.",
        "The second half is the one that costs money quietly. Jotform's support confirms there is no direct integration with the Facebook Conversions API, no built-in Google Ads conversion action, and no report of which page a respondent abandoned on. So a funnel behind paid traffic is reporting a browser pixel event from a redirected thank-you page, if it reports anything at all.",
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
      "The ordinary intake work moves across. Jotform does all of this too, and on several lines it does it on more plans or in more ways; the point of the list is that nothing here stops working when you leave. Plans are named where something is tier-gated.",
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
      "payments",
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
      "Jotform is one of the broadest products in this category, and nearly all of this is something it has and we do not. Read it as a list of reasons to stay rather than a disclaimer.",
    items: lacks(
      "questionTypes",
      "fileUpload",
      "embeds",
      "languages",
      "esign",
      "stripe",
      "zapier",
      "api",
      "abTesting",
      "questionStats",
      "aiQuestions",
      "compliance",
      "accessibility",
      "freePlan",
      "volume",
      "annual",
    ),
  },
  comparison: {
    competitor: "Jotform",
    source:
      "read from their own pricing page, help centre and support answers on 27 October 2026. Their custom-domain tier is stated inconsistently on their own site, as Enterprise in the help centre and in a Gold bullet on the pricing page",
    rows: [
      {
        label: "Gate runs before the opt-in",
        us: "Yes, on the first screen. A failed gate stores no lead, no submission and no result, and fires an exclusion event.",
        them: "No gate. Nothing is stored until Submit, which is genuinely better than most form tools, but routing can only happen at the end.",
      },
      {
        label: "Are disqualified visitors metered?",
        us: "Never. Only qualified completions count, and previews are unmetered.",
        them: "A submission is a submission. Test entries count too, and deleting or purging does not free the count.",
      },
      {
        label: "Server-side Conversions API",
        us: "Yes, on every paid plan including the $39 one, deduplicated against the browser pixel.",
        them: "No. Their support states there is no direct Conversions API integration and points to Zapier or a custom endpoint.",
      },
      {
        label: "Qualified-only conversion event",
        us: "Yes, as its own event, with an exclusion signal for everybody turned away.",
        them: "No. The pixel widget tracks form traffic, and the standard iframe embed does not support event tracking inside the form.",
      },
      {
        label: "Scoring engine, or formulas you build",
        us: "A weight per question, a score per category with its own named bands, and an overall band on the percentage, validated against overlaps.",
        them: "Calculation values per option and calculation widgets. Weights and category subscores are formulas you assemble and maintain yourself.",
      },
      {
        label: "Conditional logic",
        us: "Answer-based skip, jump, converge and cascade into a different assessment.",
        them: "Six condition types including show/hide, calculate, skip page and change thank-you page. Comfortably their equal or better.",
        tie: true,
      },
      {
        label: "Branded PDF report",
        us: "Yes, on every paid plan, built from the stored snapshot. It is for your team, not the respondent.",
        them: "Yes, and better: a PDF editor with templates, attachable to the autoresponder so the respondent gets it.",
        themWins: true,
      },
      {
        label: "Custom domain",
        us: "Yes, from $79/mo, with the certificate provisioned.",
        them: "Enterprise, at unpublished pricing. Lower plans get a slug on form.jotform.com.",
      },
      {
        label: "Branding removed",
        us: "Yes, from $79/mo.",
        them: "Yes, from Bronze at $39/mo. Cheaper than ours.",
        themWins: true,
      },
      {
        label: "Webhooks and CSV export",
        us: "Signed webhooks with a durable retry queue, and export on every plan.",
        them: "Webhooks to one or more endpoints, and export. Fine on both sides.",
        tie: true,
      },
      {
        label: "Field types",
        us: "Two: single-select and free text.",
        them: "Dozens, plus a 300-widget library: file upload, matrix, star and scale rating, NPS, date, appointment, signature, products.",
        themWins: true,
      },
      {
        label: "Embed in a page you already have",
        us: "No. The funnel is a hosted page on your own domain, distributed as a link.",
        them: "Iframe, WordPress, feedback button, popup, lightbox and source code.",
        themWins: true,
      },
      {
        label: "More than one language",
        us: "No. One language per funnel.",
        them: "130-plus languages with AI translation and a language dropdown on the form.",
        themWins: true,
      },
      {
        label: "Offline and kiosk collection",
        us: "No. Every response needs a live connection.",
        them: "Offline forms and kiosk mode in their mobile app, storing on the device and syncing later.",
        themWins: true,
      },
      {
        label: "Signatures and payments",
        us: "No signature. Payments are Razorpay, in rupees, only.",
        them: "Jotform Sign with an audit trail, and 33 payment gateways including Stripe, PayPal, Apple Pay and ACH.",
        themWins: true,
      },
      {
        label: "API, Zapier and CRM connectors",
        us: "Two read endpoints on Agency, $249. No Zapier app, no named CRM connector.",
        them: "A REST API on every tier, Zapier and Make, and HubSpot, Salesforce, Zoho, Pipedrive and Keap.",
        themWins: true,
      },
      {
        label: "HIPAA, accessibility and compliance",
        us: "None. No BAA, no SOC 2, no ISO, no VPAT, no SSO.",
        them: "HIPAA with an in-app BAA from Gold up, a WCAG 2.1 AA claim with a VPAT, a self-serve DPA, and SAML SSO on Enterprise.",
        themWins: true,
      },
      {
        label: "Free plan and entry volume",
        us: "No free plan. 14 days of the full product, then $39/mo for 150 qualified responses, billed monthly.",
        them: "Free with 100 submissions a month, then Bronze at $39/mo for 1,000 submissions.",
        themWins: true,
      },
    ],
  },
  betterWhen:
    "Jotform is the better buy for almost any intake that is not a qualification funnel. Registrations, bookings, uploads, signed documents, payments through one of thirty-three gateways, anything collected offline on a tablet, anything in two languages, anything that has to satisfy HIPAA or an accessibility review. It also gives you far more submissions for the same money. Choose Assess360 only when the job of the form is to turn people away and teach an ad account who to stop chasing.",
  faqs: [
    {
      q: "Can Jotform not already score a form?",
      a: "It can. Calculation values give each option a number, calculation widgets do the arithmetic, and conditions switch the thank-you page on the total. Their support documents building category subscores as one widget per category. The honest difference is that you own and maintain those formulas, while here weights, category bands and the overall band are fields with validation behind them. The bigger difference is the gate and the conversion event, which are not features Jotform is missing so much as things it is not for.",
    },
    {
      q: "Does Jotform report conversions to Meta?",
      a: "Only through a browser pixel, and their own support notes the standard iframe embed does not support pixel event tracking inside the form, recommending a full source-code embed plus Tag Manager instead. There is no Conversions API integration, no built-in Google Ads conversion action, and no per-step drop-off report. For a funnel behind paid traffic that is the part that quietly costs money.",
    },
    {
      q: "What would I lose by moving?",
      a: "File uploads, matrices, ratings, NPS, appointments, 130 languages, offline and kiosk collection, Jotform Sign, thirty-three payment gateways, the REST API, Zapier and Make, the CRM connectors, HIPAA and the BAA, the accessibility VPAT, the free plan, and 1,000 submissions at the price where we give 150. That is a long list and we are not going to pretend it is short.",
    },
    {
      q: "Can I move my Jotform across?",
      a: "The single-select and free-text questions move by pasting them into the plain-text importer. Everything else, uploads, ratings, matrices, has to be rewritten or dropped. The gate is new. Send us your live link and we will rebuild the whole thing with a gate in front of it, free, then take it live with you on one 30-minute call.",
    },
  ],
  cta: {
    heading: "Move the triage into the form",
    body: "Build the scoring version of one Jotform, with a gate in front of it, and see what reaches your calendar afterwards.",
  },
};
