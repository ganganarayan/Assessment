import type { SeoPage } from "@/lib/seo/types";
import { caps, lacks } from "../capabilities";

export const page: SeoPage = {
  slug: "riddle-alternative",
  kind: "comparison",
  intent:
    "Someone using Riddle for embedded quizzes and polls on a content site who needs a standalone qualification funnel on their own domain for enquiries, rather than engagement content inside articles.",
  primaryKeyword: "riddle quiz alternative",
  secondaryKeywords: [
    "riddle alternative for lead qualification",
    "alternative to riddle quiz maker",
    "riddle vs assess360",
  ],
  title: "Riddle Alternative for Lead Qualification",
  description:
    "Assess360 against Riddle: a funnel on your own domain with server-side ad reporting, against an embed-first quiz maker with unlimited leads.",
  h1: "Assess360 as a Riddle alternative",
  shortName: "vs Riddle",
  factsCheckedOn: "2026-10-27",
  lede:
    "Riddle is built to live inside a page somebody is already reading, and it is good at it: matrix and promoter-score blocks, personality scoring from minus a hundred to plus a hundred, percentage result ranges, unlimited leads. The catch for paid traffic is structural. There is no custom domain on any plan, and the Meta pixel only fires when the Riddle is embedded on a domain you have verified with your own pixel already on the page.",
  updatedAt: "2026-10-27",
  internalLinks: ["lead-qualification-software", "scorecard", "meta-ads-lead-qualification"],
  sections: [
    {
      id: "embed-vs-destination",
      heading: "An embed inside content, or a page an ad can point at",
      answer:
        "Engagement content keeps a reader on the page; a qualification funnel is the page, and everything on it exists to reach a verdict.",
      paragraphs: [
        "That difference drives the detail. A funnel needs its own URL on your domain, a result page that differs by band, and no navigation inviting people to wander off before they finish.",
        "Riddle's hosted page is on riddle.com, and that is not a tier you can upgrade past: their documentation offers an embed-domain allowlist rather than a custom domain, on every plan including Enterprise. If the ad has to land on your brand, the only route is embedding it in a page you host, which is also the only way their Meta pixel works.",
      ],
      bullets: [],
    },
    {
      id: "verdict",
      heading: "What the funnel has to produce",
      answer:
        "A score, a verdict against your threshold, a routed respondent, and a signal back to whoever paid for the click.",
      paragraphs: [
        "If you are running paid traffic to it, that last one is what separates a funnel that improves over time from one that simply reports what happened. Riddle's tracking is browser-side: their pixel article describes custom events fired through the pixel, with no Conversions API, access token or dataset anywhere in it, and Analytics and Tag Manager sit on their Business tier.",
        "There is a second-order effect worth naming. Because the pixel needs the Riddle embedded on your verified domain with your own pixel present, a campaign pointed at a riddle.com link reports nothing at all, and the fix is the thing you were trying to avoid.",
      ],
      bullets: [
        "Hosted on your own domain, with no surrounding page to leak attention",
        "A gate before the opt-in, so a rejection leaves no record",
        "Bands, category subscores and a qualified threshold",
        "Qualified-only conversion events sent server-side, plus an exclusion audience",
      ],
    },
    {
      id: "unlimited-for-whom",
      heading: "Unlimited is worth a lot, for the right business",
      answer: "For a publisher, unmetered leads are plainly better. For a service business, they are beside the point.",
      paragraphs: [
        "Riddle's model suits media: run a quiz across a large audience, collect everything, pay a flat fee. Content, views and leads are all unlimited on every plan, and the only real ceiling is how many people are taking it at once. If entrants are audience members rather than sales prospects, counting them would be absurd and Riddle is right not to.",
        "The calculation changes entirely when each respondent is a potential call. Then the question is not how many you can collect without being charged, but how few you can get away with speaking to.",
        "There is a version of this where both are true at once: a publisher running audience quizzes on Riddle, and one gated scorecard on a landing page that feeds the sales team. Nothing about the two models conflicts, and the second is a far smaller purchase than replacing the first.",
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
      "Riddle does the quiz work too, and on block variety and scoring flexibility it does more of it than we do. The list is here so that the argument above rests on where the funnel lives and what it reports, rather than on pretending the quiz half is one-sided.",
    items: caps(
      "points",
      "weights",
      "bands",
      "logic",
      "pacing",
      "resultPage",
      "resultLink",
      "redirect",
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
      "Riddle is the broader quiz tool and the more generous plan, and on accessibility and certification it is simply ahead of us. These are the absences worth knowing before you move anything.",
    items: lacks(
      "questionTypes",
      "fileUpload",
      "embeds",
      "languages",
      "volume",
      "abTesting",
      "api",
      "zapier",
      "compliance",
      "accessibility",
      "aiQuestions",
      "freePlan",
      "annual",
    ),
  },
  comparison: {
    competitor: "Riddle",
    source:
      "read from their own pricing page and help centre on 27 October 2026. Their pricing page serves local currency by region and offers no currency switcher, so no dollar figure for their plans is quoted here rather than quote one we could not verify from their own page",
    rows: [
      {
        label: "Custom domain",
        us: "Yes, from $79/mo, the whole funnel on your own domain with the certificate provisioned.",
        them: "None, on any plan. The hosted page is a riddle.com URL; what they offer is an allowlist of domains you may embed on.",
      },
      {
        label: "Gate runs before the opt-in",
        us: "Yes. A failed gate stores no lead, no submission and no result, and fires an exclusion event.",
        them: "No gate is documented. Branching can reach a result before a later lead block, but there is no disqualification concept.",
      },
      {
        label: "Server-side Conversions API",
        us: "Yes, on every paid plan including the $39 one, deduplicated against the browser pixel.",
        them: "No. Their pixel article covers browser-side custom events only, with no access token or dataset.",
      },
      {
        label: "Does the pixel work on a hosted link?",
        us: "Yes. Pixel and server events fire on your own domain with no setup on your part.",
        them: "No. Their pixel requires the Riddle embedded on a verified domain with your pixel already on that page.",
      },
      {
        label: "Qualified-only conversion event",
        us: "Yes, as its own event, with an exclusion signal for everybody turned away.",
        them: "No. All their events fire by default through the pixel, with per-event opt-out.",
      },
      {
        label: "Points per answer and subscores",
        us: "Points per option, a weight per question, and a score per category with its own bands.",
        them: "A scoring matrix where every answer carries any value from minus 100 to 100 per outcome, plus attributes shown as percentages. More flexible than ours.",
        themWins: true,
      },
      {
        label: "Percentage bands choosing a result",
        us: "Named bands on the percentage, overall and per category, validated against overlaps.",
        them: "A slider that sets which percentage range leads to which result page, with manual range editing.",
        tie: true,
      },
      {
        label: "Result page built from blocks",
        us: "Yes, two builders, including dynamic band and category-score blocks.",
        them: "Yes, with a score ring, answered-block stats, winning personality, attributes and a leaderboard.",
        tie: true,
      },
      {
        label: "Branded PDF report",
        us: "Yes, on every paid plan, built from the stored snapshot.",
        them: "No PDF report. Stats and leads export as files only.",
      },
      {
        label: "Conditional logic",
        us: "Answer-based skip, jump, converge and cascade into a different assessment.",
        them: "Five branching modes including field conditions, answer-based, score thresholds and cumulative totals.",
        tie: true,
      },
      {
        label: "Webhooks and export",
        us: "Signed webhooks with a durable retry queue, and CSV export on every plan.",
        them: "Leads to a webhook, and file export of stats and leads.",
        tie: true,
      },
      {
        label: "Question and block variety",
        us: "Two: single-select and free text.",
        them: "Far more: matrix and Likert, promoter score, ranking, file upload, date and time, ratings, plus minigames and predictors.",
        themWins: true,
      },
      {
        label: "Response volume",
        us: "150 qualified responses a month at $39, 1,000 at $79.",
        them: "Unlimited content, views and leads on every plan. The only ceiling is concurrent participants.",
        themWins: true,
      },
      {
        label: "Accessibility and certification",
        us: "None. No WCAG work, no audit, no ISO, no SOC 2, no two-factor login.",
        them: "Partial WCAG 2.2 AA conformance with a published third-party audit, ISO 27001 certified, EU-only hosting, and two-factor on every plan.",
        themWins: true,
      },
      {
        label: "API and languages",
        us: "Two read endpoints on Agency, $249. One language per funnel.",
        them: "An API on every plan with a bearer token, and interface localisation in 67 languages.",
        themWins: true,
      },
    ],
  },
  betterWhen:
    "Riddle is the right tool if the quiz belongs inside content you already publish. Unlimited leads and views on every plan, a far wider set of blocks, minigames and leaderboards, ISO 27001, EU-only hosting, a real third-party accessibility audit, and an API on every tier. For a publisher or a large audience it is not close. The one thing it cannot be is the page an ad points at, because there is no custom domain on any plan and the pixel only works once the quiz is embedded on a site you host.",
  faqs: [
    {
      q: "Can I run Riddle on my own domain?",
      a: "No, on any plan. The hosted page is a riddle.com URL, and what their plans offer instead is an allowlist of domains you are permitted to embed on, three to fifteen depending on tier. If the requirement is an ad landing on your own brand, embedding it in a page you host is the only route, and that is also the only configuration in which their Meta pixel fires.",
    },
    {
      q: "Does Riddle support the Conversions API?",
      a: "No. Their pixel documentation describes custom events sent browser-side, with no access token, dataset or server-side option, and Analytics and Tag Manager are on their Business tier. Combined with the pixel needing a verified embed domain, a campaign pointed at a Riddle link reports nothing at all back to the ad account.",
    },
    {
      q: "What would I lose by moving?",
      a: "Unlimited leads and views, matrix and promoter-score blocks, ranking, file upload, the minigames and leaderboards, the API on every plan, 67-language interface localisation, ISO 27001 certification, EU-only hosting, two-factor login and a genuine third-party accessibility audit. On accessibility and certification they are ahead of us and we are not going to pretend otherwise.",
    },
    {
      q: "Can I move my Riddle across?",
      a: "Single-select and text questions move by pasting them into the plain-text importer. Matrix, promoter score, ranking, uploads and anything gamified do not, because we have no equivalent. Send us the live link and we will rebuild it as a gated funnel on your own domain, free, then take it live with you on one 30-minute call.",
    },
  ],
  cta: {
    heading: "Give the ad somewhere to land",
    body: "Put one gated scorecard on your own domain, reporting qualified completions server-side, and leave the audience quizzes where they are.",
  },
};
