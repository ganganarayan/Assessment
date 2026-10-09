import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "riddle-alternative",
  kind: "comparison",
  intent:
    "Someone using Riddle for embedded quizzes and polls on a content site who needs a standalone qualification funnel for enquiries rather than engagement content inside articles.",
  primaryKeyword: "riddle quiz alternative",
  secondaryKeywords: [
    "riddle alternative for lead qualification",
    "alternative to riddle quiz maker",
    "riddle vs assess360",
  ],
  title: "Riddle Alternative for Lead Qualification",
  description:
    "How Assess360 differs from an embeddable quiz maker: a hosted qualification funnel on your own domain that filters enquiries and reports the outcome to your ads.",
  h1: "Assess360 as a Riddle alternative",
  shortName: "vs Riddle",
  factsCheckedOn: "2026-10-09",
  lede:
    "Embedded quizzes and polls are engagement content: they sit inside a page someone is already reading and give them something to do. A qualification funnel is a destination of its own, because an ad has to point somewhere and that somewhere has to make a decision.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "scorecard", "meta-ads-lead-qualification"],
  sections: [
    {
      id: "embed-vs-destination",
      heading: "An embed inside content, or a page an ad can point at",
      answer:
        "Engagement content keeps a reader on the page; a qualification funnel is the page, and everything on it exists to reach a verdict.",
      paragraphs: [
        "That difference drives the detail. A funnel needs its own URL on your domain, a result page that differs by band, and no navigation inviting people to wander off before they finish.",
      ],
      bullets: [],
    },
    {
      id: "verdict",
      heading: "What the funnel has to produce",
      answer:
        "A score, a verdict against your threshold, a routed respondent, and a signal back to whoever paid for the click.",
      paragraphs: [
        "If you are running paid traffic to it, that last one is what separates a funnel that improves over time from one that simply reports what happened.",
      ],
      bullets: [
        "Hosted on your own domain, with no surrounding page to leak attention",
        "A gate before the opt-in, so a rejection leaves no record",
        "Bands, weighted scoring and a qualified threshold",
        "Qualified-only conversion events and an exclusion audience",
      ],
    },
    {
      id: "unlimited-for-whom",
      heading: "Unlimited is worth a lot, for the right business",
      answer: "For a publisher, unmetered responses are plainly better. For a service business, they are beside the point.",
      paragraphs: [
        "Riddle's model suits media: run a quiz across a large audience, collect everything, pay a flat fee. If entrants are audience members rather than sales prospects, counting them would be absurd and Riddle is right not to.",
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
  comparison: {
    competitor: "Riddle",
    source: "published plan pages as summarised by third-party pricing trackers, October 2026",
    rows: [
    {
      label: "Gate runs before the opt-in",
      us: "Yes, before the opt-in. A failed gate stores no lead, no submission and no result.",
      them: "No pre-opt-in gate.",
    },
    {
      label: "Are disqualified visitors metered?",
      us: "Never. Only qualified responses count against the plan.",
      them: "Unlimited submissions and leads on every paid plan, which is rare.",
      themWins: true,
    },
    {
      label: "Weighted category scoring",
      us: "Yes. Weighted categories, a weighted total, and named result bands.",
      them: "Scored quizzes and personality formats. No weighted categories with bands.",
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
      them: "White labelling from the Pro plan.",
    },
    {
      label: "Entry price",
      us: "$39/mo, or $32 billed annually.",
      them: "From about $59/mo Essential, with unlimited submissions.",
    },
    ],
  },
  betterWhen:
    "Riddle is built for publishers and media teams, and its unmetered model is genuinely better than ours for high volume: unlimited submissions on every paid plan, plus GDPR-focused hosting options and a wide spread of content formats. If you are running quizzes at media scale where every entrant is an audience member rather than a sales lead, pay the higher monthly fee and stop counting.",
  faqs: [
    {
      q: "Riddle has unlimited responses. Isn't that strictly better?",
      a: "For a publisher, yes. Unlimited matters when every respondent has value. When most of them do not, unlimited collection of people you cannot sell to is not a saving, and the cost has just moved from your invoice to your calendar.",
    },
    {
      q: "Does Assess360 do personality quizzes and the other formats?",
      a: "No. One format, a gated scorecard. Riddle covers considerably more ground on content types and does it well.",
    },
    {
      q: "Which is better for GDPR?",
      a: "Riddle makes more of it, with EU hosting options aimed at publishers. We keep data minimal by a different route: a disqualified visitor has nothing stored about them at all, because the record is never created.",
    },
  ],
  cta: {
    heading: "Give the ad somewhere to land",
    body: "A hosted qualification funnel on your own domain, with a verdict at the end of it.",
  },
};
