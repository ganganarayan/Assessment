import type { SeoPage } from "@/lib/seo/types";
import { caps, lacks } from "../capabilities";

export const page: SeoPage = {
  slug: "interact-alternative",
  kind: "comparison",
  intent:
    "A creator or ecommerce marketer using Interact quizzes for list growth and product recommendations, who now needs the quiz to qualify enquiries for a service or a call and to run on their own domain.",
  primaryKeyword: "interact quiz alternative",
  secondaryKeywords: [
    "interact alternative for lead qualification",
    "alternative to interact quiz maker",
    "interact vs assess360",
  ],
  title: "Interact Alternative for Lead Qualification",
  description:
    "Assess360 against Interact: a scored funnel on your own domain with webhooks and server-side ad reporting, against a quiz lead magnet built for list growth.",
  h1: "Assess360 as an Interact alternative",
  shortName: "vs Interact",
  factsCheckedOn: "2026-10-27",
  lede:
    "Interact is a quiz maker aimed at creators and ecommerce: recommend a product, segment a list, grow an audience, and it is well made for that. For a funnel behind paid traffic three facts decide it. There is no custom domain on any plan, there are no webhooks and no public API, and conversions are inferred from a result-page URL in Meta rather than reported.",
  updatedAt: "2026-10-27",
  internalLinks: ["lead-qualification-quiz", "lead-qualification-software", "scorecard"],
  sections: [
    {
      id: "segment-vs-qualify",
      heading: "Segmenting and qualifying are not the same thing",
      answer:
        "Segmenting sorts everyone into a bucket; qualifying decides that some people get no bucket at all.",
      paragraphs: [
        "A recommendation quiz has no wrong answer, because every path ends in a product or a list. A qualification funnel does have wrong answers, and it has to be willing to end the visit on one of them.",
        "Interact is explicit about the shape it is built for: the opt-in form is a single global step between the questions and the results, and the documented control is whether the skip button is available. There is no way to disqualify one respondent and bypass capture for them alone, which is the whole mechanism here.",
      ],
      bullets: [],
    },
    {
      id: "service-businesses",
      heading: "Built for service businesses buying traffic",
      answer:
        "Where the cost of a bad lead is an hour of someone's time rather than an unopened email, filtering pays for itself immediately.",
      paragraphs: [
        "That is the situation Assess360 is designed around: paid traffic, a calendar that fills, and a sales team whose hours are the real constraint.",
        "Two of Interact's own documented limits matter a lot in that situation. Their Facebook pixel article sets conversion tracking up as a Meta custom conversion keyed to result-page URLs containing the word result, and states plainly that you will not be able to track people who drop through the quiz questions. And turning branching on removes the back button and the progress bar, while branching combined with scored logic makes the score ranges inaccurate, so a result has to be assigned per branch by hand.",
      ],
      bullets: [
        "A gate before the opt-in, so unqualified visitors leave no lead",
        "A weight per question, category subscores, bands and a qualified threshold",
        "Server-side qualified-only conversion events for Meta, on the $39 plan",
        "The funnel on your own domain, from $79",
      ],
    },
    {
      id: "audience-vs-calendar",
      heading: "Monetising an audience against filling a calendar",
      answer: "If every subscriber has value, do not install a gate. If your constraint is calendar hours, you need one.",
      paragraphs: [
        "The question that decides this is not about features. It is whether the thing that runs out first is your list or your week. A creator selling a product to a list wants the list as large as it can be, and disqualifying people would be self-harm.",
        "A service business selling an hour at a time has a hard ceiling on how many conversations it can have, and every one spent on somebody who was never going to buy is taken from somebody who might have.",
        "Interact is also better than us at the distribution half of that creator job, and it is worth naming: quiz delivery through Instagram DMs with ManyChat, Story and Pin share flows, nineteen native email integrations on its Lite tier, and an AI quiz maker that writes the whole thing. If the list is the asset, that is the better toolkit.",
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
      "The quiz work moves across, and on the parts a creator uses most, Interact does them too. The list is here so the case above rests on the domain, the webhook and the conversion signal rather than on implying a quiz tool cannot run a quiz.",
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
      "Interact is narrower than most products on this site, so this list is shorter than the others, but the first few lines are real and the email-integration one in particular is where it beats us outright.",
    items: lacks(
      "questionTypes",
      "fileUpload",
      "embeds",
      "zapier",
      "api",
      "aiQuestions",
      "abTesting",
      "languages",
      "compliance",
      "freePlan",
      "annual",
    ),
  },
  comparison: {
    competitor: "Interact",
    source:
      "read from their own plans page and help centre on 27 October 2026. Their own pages disagree about seat counts and quiz limits between the feature lists and the comparison table, and their monthly prices appear only on cached versions",
    rows: [
      {
        label: "Custom domain",
        us: "Yes, from $79/mo, the whole funnel on your own domain with the certificate provisioned.",
        them: "None, on any tier. Their help centre explains why shares carry tryinteract.com and suggests redirecting results to your own page instead.",
      },
      {
        label: "Gate runs before the opt-in",
        us: "Yes. A failed gate stores no lead, no submission and no result, and fires an exclusion event.",
        them: "No. One global opt-in form sits between the questions and the results, and the only control is whether the skip button shows.",
      },
      {
        label: "Server-side Conversions API",
        us: "Yes, on every paid plan including the $39 one, deduplicated against the browser pixel.",
        them: "No, and no server-side option is documented anywhere.",
      },
      {
        label: "What the pixel can actually see",
        us: "Pixel and server events at every stage, including the people turned away.",
        them: "A Meta custom conversion keyed to result-page URLs, on Growth and Pro. Their own article says drop-offs through the questions cannot be tracked.",
      },
      {
        label: "Webhooks",
        us: "Signed webhooks with a durable retry queue, on every paid plan including the $39 one.",
        them: "None documented anywhere in their help centre.",
      },
      {
        label: "Are disqualified visitors metered?",
        us: "Never. Only qualified completions count, and previews are unmetered.",
        them: "On their free plan a completion counts whether or not the person opts in. On paid tiers the unit is email leads, and overage behaviour is not documented.",
      },
      {
        label: "Points per answer",
        us: "Points per option, a weight per question, and a score per category with its own bands.",
        them: "Yes, each answer choice can carry its own point value, and a categories quiz totals points per category with its own ranges.",
        tie: true,
      },
      {
        label: "Score ranges choosing a result",
        us: "Named bands on the percentage, overall and per category, validated against overlaps.",
        them: "Numeric score ranges per result, with advice to cover every possible total. Comfortably equivalent.",
        tie: true,
      },
      {
        label: "Many different outcomes",
        us: "Band-specific content inside one result page per funnel.",
        them: "Yes, and more of them: a result per branch path, up to around fifty comfortably, plus a top-results option.",
        themWins: true,
      },
      {
        label: "Conditional logic",
        us: "Answer-based skip, jump, converge and cascade, with the step counter kept.",
        them: "Map-based branching from Lite up, but turning it on removes the back button and the progress bar, and it breaks scored result ranges.",
      },
      {
        label: "Branded PDF report",
        us: "Yes, on every paid plan, built from the stored snapshot.",
        them: "None documented.",
      },
      {
        label: "Branding removed",
        us: "Yes, from $79/mo.",
        them: "Yes, on Growth at $53/mo billed annually. Cheaper than ours.",
        themWins: true,
      },
      {
        label: "Native email and CRM integrations",
        us: "None. A webhook you point at your own endpoint, and your own email credentials.",
        them: "Nineteen native integrations from Lite up including Klaviyo, Mailchimp, ActiveCampaign and Kit, and HubSpot and Keap on Pro.",
        themWins: true,
      },
      {
        label: "AI that writes the quiz",
        us: "No. The AI writes the report at the end; the questions are yours.",
        them: "Yes, an AI quiz maker that builds the questions and results from a topic.",
        themWins: true,
      },
      {
        label: "Free plan and entry price",
        us: "No free plan. 14 days of the full product, then $39/mo for 150 qualified responses, billed monthly.",
        them: "A free plan with 100 completions a cycle, then Lite at $27/mo billed annually with 500 email leads.",
        themWins: true,
      },
    ],
  },
  betterWhen:
    "Interact is the better buy if the quiz is a lead magnet for a list. It is cheaper, it has a free plan, it removes branding on a lower tier than we do, it has nineteen native email integrations where we have a webhook, it writes the quiz for you with AI, and it has real distribution tricks like delivering the quiz through Instagram DMs. Choose it whenever every subscriber has value. Choose Assess360 when the funnel has to live on your own domain, refuse people, and report a qualified completion server-side, because Interact does none of those three.",
  faqs: [
    {
      q: "Can I run an Interact quiz on my own domain?",
      a: "No, on any tier. Their help centre explains that shared links carry tryinteract.com and the recommended workaround is redirecting the result page to your own landing page afterwards, which puts the quiz itself on their domain and the brand experience after the decision. For an ad landing page that is the wrong way round.",
    },
    {
      q: "How well can Interact track a paid campaign?",
      a: "Not well, by their own account. Conversion tracking is a Meta custom conversion matched on result-page URLs containing the word result, it is restricted to their Growth and Pro tiers, and their own article states you will not be able to track people who drop through the quiz questions. There is no Conversions API and no webhook, so there is no server-side path either.",
    },
    {
      q: "What would I lose by moving?",
      a: "The nineteen native email integrations, the AI quiz maker, the free plan, branding removal at a lower price, the Instagram DM delivery, and the ability to hand a respondent one of fifty different outcomes. If your quiz is a list builder, most of that matters more than anything we add.",
    },
    {
      q: "Can I move my Interact quiz across?",
      a: "The questions move by pasting them into the plain-text importer, since Interact's questions are text or image choices and ours are single-select. Images on answers do not come across. The gate is new. Send us your live link and we will rebuild it with a gate in front of it on your own domain, free, then take it live with you on one 30-minute call.",
    },
  ],
  cta: {
    heading: "Qualify instead of segment",
    body: "Put the same quiz on your own domain with a gate in front of it, and report the qualified ones to your ad account from the server.",
  },
};
