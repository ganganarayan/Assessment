import type { SeoPage } from "@/lib/seo/types";
import { caps, lacks } from "../capabilities";

export const page: SeoPage = {
  slug: "marquiz-alternative",
  kind: "comparison",
  intent:
    "A performance marketer running cheap quiz funnels on paid traffic who is getting volume but not customers, and needs the quiz to filter and to feed the ad platform a signal about quality rather than completion.",
  primaryKeyword: "marquiz alternative",
  secondaryKeywords: [
    "marquiz alternative for lead qualification",
    "alternative to marquiz",
    "marquiz vs assess360",
  ],
  title: "Marquiz Alternative for Lead Qualification",
  description:
    "Assess360 against Marquiz: both send server-side Meta events, only one gates before the opt-in and reports qualification rather than completion.",
  h1: "Assess360 as a Marquiz alternative",
  shortName: "vs Marquiz",
  factsCheckedOn: "2026-10-27",
  lede:
    "Marquiz is the most capable cheap quiz builder on this list, and the one closest to us on measurement: it supports the Meta Conversions API, untiered, alongside the pixel. So the difference here is not whether events reach the server. It is what the events say, and whether a wrong-fit visitor is counted and billed before anybody has decided they were wrong.",
  updatedAt: "2026-10-27",
  internalLinks: ["meta-ads-lead-qualification", "lead-qualification-quiz", "lead-qualification-software"],
  sections: [
    {
      id: "volume-trap",
      heading: "Cheap leads teach the campaign the wrong lesson",
      answer:
        "Every unqualified conversion you report is an instruction to the ad platform to find more people like that one.",
      paragraphs: [
        "This is the part that compounds. A quiz funnel that converts well on a cheap event does not just produce bad leads once; it retrains delivery towards the audience that produces them, and the account gets worse at finding buyers over time.",
        "Marquiz fires its events by quiz stage: a view-content event per question step, and a lead event on finish, on contacts, and on payment. Through the Conversions API those reach Meta from the server, which is genuinely better than most of this category. But a stage is not a verdict. Nothing in that set distinguishes a lead worth calling from a lead who answered fast, so the algorithm is being told how far people got, not who was worth having.",
      ],
      bullets: [],
    },
    {
      id: "fix",
      heading: "What fixes it",
      answer:
        "Report qualification instead of completion, and exclude the people who were turned away.",
      paragraphs: [
        "Assess360 runs the gate before the opt-in, so the disqualified never become leads, and sends the qualified completion server-side as the event campaigns optimise on. The rejections populate an exclusion audience rather than disappearing.",
        "Marquiz can get close to one half of this by accident: a result can be shown before the contact form, and the contact form can be disabled entirely. But that is a configuration side-effect rather than a gate, there is no named disqualification, and their own analytics documentation says that with the form disabled the leads-received figure counts everybody who completed the quiz. The people you were trying not to count are counted.",
      ],
      bullets: [
        "Fewer leads, each worth more, with the cost difference visible per qualified lead",
        "An exclusion audience built from real rejections, carrying no personal data",
        "A qualified-only event, distinct from a completion, rather than a stage event",
        "The funnel on your own domain from $79, with your own branding",
      ],
    },
    {
      id: "paying-per-lead",
      heading: "What it means to be billed per lead",
      answer: "A plan priced in lead blocks charges you more in exactly the months your targeting got worse.",
      paragraphs: [
        "That is not a criticism of Marquiz so much as a description of the model. Leads are the unit, so a month of broad traffic and weak targeting is a month that costs more, and the tool has no reason to care whether those leads were any good. The blocks are also small: ten free, thirty on their entry paid plan, a hundred at the price where custom domains and branding removal unlock, with unused credits forfeited on a plan change and leads collected while unpaid locked until you renew.",
        "Metering qualified responses only inverts that. Tighten the gate and your bill goes down, not up, which is the only version of this where the vendor and the customer want the same thing.",
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
      "Marquiz covers all of this too, and on question variety and distribution it covers more than we do. This is the page where the gap is narrowest, so the list matters most: the argument has to rest on what the events mean and what gets metered, not on capability.",
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
      "payments",
      "captureOrder",
      "domain",
      "branding",
      "templates",
      "importer",
      "retakes",
      "webhooks",
      "export",
      "submissions",
      "emailSending",
      "pixel",
      "stats",
      "utm",
      "seats",
      "unsubscribe",
    ),
  },
  limits: {
    intro:
      "Marquiz is wider than us in most directions and cheaper to start. The question types, the embed options, the languages and the in-quiz cart are all real advantages it has and we do not.",
    items: lacks(
      "questionTypes",
      "fileUpload",
      "embeds",
      "languages",
      "abTesting",
      "zapier",
      "api",
      "aiQuestions",
      "prefill",
      "questionStats",
      "compliance",
      "freePlan",
      "annual",
    ),
  },
  comparison: {
    competitor: "Marquiz",
    source:
      "read from their own pricing page and help centre on 27 October 2026. Their prices are shown excluding VAT, they publish no annual price, and no per-lead price above their 100-lead tier is listed on the page",
    rows: [
      {
        label: "Gate runs before the opt-in",
        us: "Yes. A failed gate stores no lead, no submission and no result, and fires an exclusion event.",
        them: "No named gate. A result can be shown before the contact form and the form can be disabled, but that is configuration, not disqualification.",
      },
      {
        label: "Are disqualified visitors metered?",
        us: "Never. Only qualified completions count, and previews are unmetered.",
        them: "Metered in leads per month, pooled across quizzes. With the form disabled their own analytics counts everybody who completed the quiz.",
      },
      {
        label: "Qualified-only conversion event",
        us: "Yes, a distinct event for people who cleared your bar, plus an exclusion signal for everybody who did not.",
        them: "No. Events are keyed to quiz stages: a view per question step, and a lead on finish, contacts and payment.",
      },
      {
        label: "Server-side Conversions API",
        us: "Yes, on every paid plan including the $39 one, deduplicated against the browser pixel.",
        them: "Yes, with an access token you paste in, a test event code and a gateway option, and it is not tier-gated. Genuinely equal footing.",
        tie: true,
      },
      {
        label: "Points per answer",
        us: "Points per option, a weight per question, and a score per category with its own bands.",
        them: "Yes, points per answer option on every tier including free. Category scoring is built from answer-letter conditions rather than a weighted category.",
        tie: true,
      },
      {
        label: "Score ranges choosing a result",
        us: "Named bands on the percentage, overall and per category, with overlaps refused at save time.",
        them: "Each result carries a points rule, evaluated in priority order with the first match winning, and a default result as the fallback.",
        tie: true,
      },
      {
        label: "Conditional logic",
        us: "Answer-based skip, jump, converge and cascade into a different assessment.",
        them: "Branching logic on every tier including free, and questions can read earlier answers.",
        tie: true,
      },
      {
        label: "Webhooks",
        us: "Signed webhooks with a durable retry queue, on every paid plan.",
        them: "Yes, on every tier including free.",
        tie: true,
      },
      {
        label: "Custom domain",
        us: "Yes, from $79/mo, with the certificate provisioned.",
        them: "Yes, on their Plus tier, from $39/mo at the 100-lead level.",
        tie: true,
      },
      {
        label: "Branded PDF report",
        us: "Yes, on every paid plan, built from the stored snapshot.",
        them: "Not documented.",
      },
      {
        label: "Per-question drop-off",
        us: "No. Stats are per stage, so you never learn which screen lost somebody.",
        them: "Yes, a per-question funnel conversion rate on their paid tiers.",
        themWins: true,
      },
      {
        label: "Question types",
        us: "Two: single-select and free text.",
        them: "Twelve, including file upload, date and time, rating, slider, dropdown, emoji and image-based choices.",
        themWins: true,
      },
      {
        label: "Embed in a page you already have",
        us: "No. The funnel is a hosted page on your own domain, distributed as a link.",
        them: "Five: button, pop-up banner, pop-up overlay, HTML block and widget, with install guides for a dozen site builders.",
        themWins: true,
      },
      {
        label: "More than one language",
        us: "No. One language per funnel.",
        them: "Quizzes can be built in 38 or more languages.",
        themWins: true,
      },
      {
        label: "A/B testing",
        us: "No. Two variants means two funnels and two ad sets.",
        them: "Yes, on their Plus tier, serving several variations under one link.",
        themWins: true,
      },
      {
        label: "Payments and cart",
        us: "A paid step through Razorpay, in rupees.",
        them: "An in-quiz cart with product details, variants, discounting and Stripe, on every tier including free.",
        themWins: true,
      },
      {
        label: "Free plan and entry price",
        us: "No free plan. 14 days of the full product, then $39/mo for 150 qualified responses.",
        them: "Free with 10 leads a month, then $19/mo for 30 leads, and Plus from $39/mo for 100.",
        themWins: true,
      },
    ],
  },
  betterWhen:
    "Marquiz is the closest competitor on this site for anybody buying Meta traffic, because it has the Conversions API and does not charge extra for it. It is also wider than us: twelve question types, five embed modes, 38 languages, an in-quiz cart, A/B testing, per-question drop-off and a free plan. Choose it if you want volume cheaply and are content for the ad platform to learn from completions. Choose Assess360 only because you want the events to mean qualified rather than finished, and because you do not want to pay for the leads you are trying not to get.",
  faqs: [
    {
      q: "Marquiz has the Conversions API too. So what is actually different?",
      a: "What the events say. Marquiz fires stage events: a view per question step, and a lead on finish, on contacts and on payment. Those are facts about progress. Here the gate runs before the opt-in, so a wrong-fit visitor never becomes a lead, the qualified completion fires as its own event, and everybody turned away fires an exclusion signal. One tells the algorithm how far people got; the other tells it who to go and find, and who to stop showing the ad to.",
    },
    {
      q: "Is Marquiz not far cheaper?",
      a: "At the bottom, yes: a free tier with ten leads and nineteen dollars for thirty. But the lead blocks are small and pooled across quizzes, unused credits are forfeited when you change plan, and leads collected while unpaid are locked until you renew, so a working campaign forces repeated tier purchases. Here the thing being metered is qualified responses, so tightening the gate lowers the bill rather than raising it.",
    },
    {
      q: "What would I lose by moving?",
      a: "Ten question types including file upload, rating and sliders, the five embed modes, 38 languages, A/B testing, per-question drop-off analytics, the in-quiz cart with Stripe, the AI quiz generator, Zapier, and the free plan. On breadth Marquiz wins, and it is the page on this site where we concede the most.",
    },
    {
      q: "Can I move my Marquiz quiz across?",
      a: "Single-select questions and typed answers move by pasting them into the plain-text importer. Sliders, ratings, dates, uploads and image choices do not, because we have no equivalent. Send us the live link and we will rebuild it with a gate in front of it, free, then take it live with you on one 30-minute call.",
    },
  ],
  cta: {
    heading: "Stop teaching the algorithm to find bad leads",
    body: "Report qualified rather than finished, exclude the people you turned away, and stop paying for the leads you did not want.",
  },
};
