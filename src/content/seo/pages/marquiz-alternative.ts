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
  factsCheckedOn: "2026-10-06",
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
  ],
  cta: {
    heading: "Stop teaching the algorithm to find bad leads",
    body: "Qualify before the opt-in, report only what qualified, and exclude the rest.",
  },
};
