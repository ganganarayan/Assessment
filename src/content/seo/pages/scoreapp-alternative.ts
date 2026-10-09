import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "scoreapp-alternative",
  kind: "comparison",
  intent:
    "Someone already running or evaluating ScoreApp for lead generation, who now needs the scorecard to filter traffic and report lead quality back to the ad platform rather than only grow a list.",
  primaryKeyword: "scoreapp alternative",
  secondaryKeywords: [
    "scoreapp alternative for lead qualification",
    "alternative to scoreapp",
    "scoreapp vs assess360",
  ],
  title: "ScoreApp Alternative for Lead Qualification",
  description:
    "How Assess360 differs from ScoreApp: a gate that runs before the opt-in, weighted scoring, and a qualified-only event sent back to your ads.",
  h1: "Assess360 as a ScoreApp alternative",
  shortName: "vs ScoreApp",
  factsCheckedOn: "2026-10-09",
  lede:
    "ScoreApp is a scorecard builder aimed at lead generation: ask questions, give a score, collect the lead. Assess360 is built for the step after that, where some of those leads should never have become leads at all, and where the ad platform needs to be told which ones were worth having.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "meta-ads-lead-qualification", "scorecard"],
  sections: [
    {
      id: "what-scoreapp-is-for",
      heading: "What ScoreApp is built for",
      answer:
        "Turning a scorecard into a lead magnet: an engaging set of questions, a personalised result, and a list that grows faster than a plain opt-in would.",
      paragraphs: [
        "That is a real job and it is done well. If the goal is to put a scorecard in front of an audience and capture more enquiries than a static form would, a tool built around that goal is a sensible choice.",
      ],
      bullets: [],
    },
    {
      id: "what-assess360-adds",
      heading: "What Assess360 is built around instead",
      answer:
        "Removing the leads you do not want before they exist, and telling the ad platform which of the rest were worth paying for.",
      paragraphs: [
        "The difference shows up when you are buying traffic. A scorecard that captures everybody hands the sales team a larger list with the same proportion of wrong-fit people in it, and the campaign keeps optimising towards whoever fills in forms.",
      ],
      bullets: [
        "A qualification gate runs BEFORE the opt-in, so a disqualifying answer creates no lead record at all",
        "Weighted category scoring with bands, so a score means something specific rather than a total",
        "A qualified-only conversion event sent server-side, so campaigns optimise on buyers",
        "An exclusion signal for the people turned away, which carries no personal data",
        "Your own domain, and a workspace per business if you run more than one",
      ],
    },
    {
      id: "who-should-not-switch",
      heading: "When ScoreApp is the better choice",
      answer:
        "If the goal is list growth and engagement rather than filtering, a tool built for that is a better fit than one built to turn people away.",
      paragraphs: [
        "Assess360 is opinionated: it exists to reduce the number of leads you receive and raise what each one is worth. If you are not running paid traffic, not short of sales hours, and genuinely want every enquiry, that opinion works against you.",
      ],
      bullets: [],
    },
    {
      id: "first-month",
      heading: "What the first month actually looks like",
      answer: "Fewer leads, and a calendar that stops containing calls you knew were wrong within ninety seconds.",
      paragraphs: [
        "The number that moves first is the one that looks like a loss. Form fills drop, because people who would have filled the form are now stopped before it. If that number is what gets reported in your weekly meeting, say so in advance, because the second month is when the useful number moves and the first month is when somebody panics.",
        "What moves second is cost per qualified lead, and it moves for a reason that has nothing to do with the gate: the ad account is being told which completions were worth having, so it stops buying more of the other kind.",
      ],
      bullets: [
        "Disqualified visitors leave no lead record, so nothing reaches your CRM to be cleaned out later",
        "A qualified-only conversion event, so the algorithm optimises toward people who passed rather than people who typed fast",
        "An exclusion audience that grows by itself, so you stop paying to reach the people you just turned away",
      ],
    },
  ],
  comparison: {
    competitor: "ScoreApp",
    source: "published plan pages as summarised by third-party pricing trackers, October 2026",
    rows: [
    {
      label: "Gate runs before the opt-in",
      us: "Yes, before the opt-in. A failed gate stores no lead, no submission and no result.",
      them: "No. Everyone who starts reaches the form; filtering happens to the lead after it exists.",
    },
    {
      label: "Are disqualified visitors metered?",
      us: "Never. Only qualified responses count against the plan.",
      them: "Every response counts against the plan, qualified or not.",
    },
    {
      label: "Weighted category scoring",
      us: "Yes. Weighted categories, a weighted total, and named result bands.",
      them: "Yes. Weighted categories and result pages, and it does them well.",
      themWins: true,
    },
    {
      label: "Qualified-only conversion event",
      us: "Yes. Qualified completions fire their own conversion event.",
      them: "No distinct qualified-completion event. A completion is a completion.",
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
      them: "Yes, on its higher plans.",
    },
    {
      label: "Entry price",
      us: "$39/mo, or $32 billed annually.",
      them: "$39/mo Starter, with 100 responses and 3 scorecards.",
    },
    ],
  },
  betterWhen:
    "ScoreApp is the closest thing to a peer on this list, and if what you need is a polished scorecard with good result pages and no interest in what your ad account learns from it, it is a mature product that will not let you down. It has been doing this longer. Choose it when the quiz is the deliverable rather than the filter, when nobody is buying cold traffic, and when a lead costs you an email rather than an hour.",
  faqs: [
    {
      q: "Is Assess360 just a cheaper ScoreApp?",
      a: "No, and the price being similar is a coincidence rather than a positioning. ScoreApp is built to produce a scorecard; this is built to produce fewer leads. The gate before the opt-in and the qualified-only event are the difference, and neither of them is a feature ScoreApp is missing so much as a thing it is not trying to do.",
    },
    {
      q: "Can I move my ScoreApp quiz across?",
      a: "The questions, yes, by pasting them into the plain-text importer. The gate is new, because ScoreApp has nowhere to put one. Send us your live link and we will rebuild the whole thing with a gate in front of it, free, within 24 hours.",
    },
    {
      q: "Does the gate hurt conversion rate?",
      a: "It lowers it, on purpose, and that is the whole point. Fewer people reach the form; the ones who do are worth a call. If you judge the change on form fills it will look like a loss, and if you judge it on calls that closed it usually does not.",
    },
  ],
  cta: {
    heading: "Try the qualification version",
    body: "Build the same scorecard with a gate in front of it, and see what happens to the lead count and to the calls that follow.",
  },
};
