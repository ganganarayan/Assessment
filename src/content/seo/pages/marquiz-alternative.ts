import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "marquiz-alternative",
  kind: "comparison",
  intent:
    "A performance marketer running cheap quiz funnels on paid traffic who is getting volume but not customers, and needs the quiz to filter and to feed the ad platform a better signal.",
  primaryKeyword: "marquiz alternative",
  secondaryKeywords: [
    "marquiz alternative for lead qualification",
    "alternative to marquiz",
    "marquiz vs assess360",
  ],
  title: "Marquiz Alternative for Lead Qualification",
  description:
    "How Assess360 differs from a quiz funnel builder: it is built to reduce lead volume and raise lead value, and to report qualification back to the ad platform.",
  h1: "Assess360 as a Marquiz alternative",
  shortName: "vs Marquiz",
  factsCheckedOn: "2026-10-09",
  lede:
    "Quiz funnel builders are popular with paid traffic for a good reason: they lift conversion rate cheaply. The catch arrives later, when the extra volume turns out to be made of people the sales team cannot sell to, and the campaign has been learning from them all along.",
  updatedAt: "2026-10-06",
  internalLinks: ["meta-ads-lead-qualification", "lead-qualification-quiz", "lead-qualification-software"],
  sections: [
    {
      id: "volume-trap",
      heading: "Cheap leads teach the campaign the wrong lesson",
      answer:
        "Every unqualified conversion you report is an instruction to the ad platform to find more people like that one.",
      paragraphs: [
        "This is the part that compounds. A quiz funnel that converts well on a cheap event does not just produce bad leads once; it retrains delivery towards the audience that produces them, and the account gets worse at finding buyers over time.",
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
      ],
      bullets: [
        "Fewer leads, each worth more, with the cost difference visible per qualified lead",
        "An exclusion audience built from real rejections, carrying no personal data",
        "Server-side events, so blocked pixels do not decide what gets counted",
        "The funnel on your own domain, with your own branding",
      ],
    },
    {
      id: "paying-per-lead",
      heading: "What it means to be billed per lead",
      answer: "A plan priced in lead blocks charges you more in exactly the months your targeting got worse.",
      paragraphs: [
        "That is not a criticism of Marquiz so much as a description of the model. Leads are the unit, so a month of broad traffic and weak targeting is a month that costs more, and the tool has no reason to care whether those leads were any good.",
        "Metering qualified responses only inverts that. Tighten the gate and your bill goes down, not up, which is the only version of this where the vendor and the customer want the same thing.",
      ],
      bullets: [
        "Disqualified visitors leave no lead record, so nothing reaches your CRM to be cleaned out later",
        "A qualified-only conversion event, so the algorithm optimises toward people who passed rather than people who typed fast",
        "An exclusion audience that grows by itself, so you stop paying to reach the people you just turned away",
      ],
    },
  ],
  comparison: {
    competitor: "Marquiz",
    source: "read from their own pricing page on 9 October 2026. Several vendors price by region, so the figure you are shown may differ",
    rows: [
    {
      label: "Gate runs before the opt-in",
      us: "Yes, before the opt-in. A failed gate stores no lead, no submission and no result.",
      them: "No pre-opt-in gate. The quiz collects, then you sort the leads.",
    },
    {
      label: "Are disqualified visitors metered?",
      us: "Never. Only qualified responses count against the plan.",
      them: "Leads are the metered unit, and the plans are priced in lead blocks.",
    },
    {
      label: "Weighted category scoring",
      us: "Yes. Weighted categories, a weighted total, and named result bands.",
      them: "Branching and results. No weighted categories with their own bands.",
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
      them: "On paid plans.",
    },
    {
      label: "Entry price",
      us: "$39/mo, or $32 billed annually.",
      them: "Free for 10 leads a month, $19/mo Start for 30, Plus from $39/mo in lead blocks.",
      themWins: true,
    },
    ],
  },
  betterWhen:
    "Marquiz is quick, cheap and specifically good at the thing it sells: turning cold traffic into quiz leads, with a free tier you can actually test on. If you are starting out and want to know whether a quiz funnel works for your offer at all, it will tell you that for almost nothing, faster than we will.",
  faqs: [
    {
      q: "Marquiz already meters leads. Isn't that the same promise?",
      a: "It is the opposite one. Marquiz charges by leads collected, so a month full of unqualified enquiries is a more expensive month. Here a disqualified visitor is never stored and never metered, so filtering harder costs you less rather than more.",
    },
    {
      q: "Is the free tier comparable?",
      a: "There is no free tier here, only a 14-day trial, so for pure testing Marquiz is the cheaper way to find out whether a quiz funnel suits your offer.",
    },
    {
      q: "When is it worth moving?",
      a: "When you are spending on ads and the lead blocks have started to feel like a tax on traffic you did not want. That is usually the month somebody works out what a wrong-fit call costs.",
    },
  ],
  cta: {
    heading: "Stop teaching the algorithm to find bad leads",
    body: "Qualify before the opt-in, report only what qualified, and exclude the rest.",
  },
};
