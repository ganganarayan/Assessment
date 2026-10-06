import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "lead-qualification-for-saas",
  kind: "use-case",
  intent:
    "A B2B SaaS team whose demo requests are dominated by free-plan users, students and companies far below the size the product is priced for, wanting to route demos by fit.",
  primaryKeyword: "lead qualification for saas",
  secondaryKeywords: [
    "b2b saas lead qualification",
    "qualify saas demo requests",
    "saas lead scoring",
    "demo request qualification",
  ],
  title: "Lead Qualification for B2B SaaS",
  description:
    "How a SaaS team scores demo requests on company size, use case and timing, so sales demos go to the accounts the pricing was built for.",
  h1: "Assess360 for B2B SaaS: route demos by fit, not by form fill",
  shortName: "For B2B SaaS",
  lede:
    "A demo request form treats every submission as equal, so an enterprise evaluation and a student project land in the same queue looking identical. Scoring the request on size, use case and timing lets sales spend its hours on the accounts the pricing was designed around.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "lead-scoring", "assessment-software"],
  sections: [
    {
      id: "fit",
      heading: "Fit is size, use case and timing",
      answer:
        "Three facts decide whether a demo is worth running, and all three can be collected before anyone books one.",
      paragraphs: [
        "Size decides whether the pricing works at all. Use case decides whether the product solves their problem or an adjacent one that will surface as churn in four months. Timing separates an evaluation from a bookmark.",
        "None of the three needs a conversation to establish, which is why collecting them after the booking step is the expensive choice: the cost is a sales hour, repeated for every mismatch.",
      ],
      bullets: [],
    },
    {
      id: "self-serve",
      heading: "Not every qualified lead should get a demo",
      answer:
        "Some should go straight to self-serve signup, because a demo slows down a purchase they were ready to make today.",
      paragraphs: [
        "Qualification is not only a filter, it is a router. A small team that fits the product perfectly and wants to start now is served better by a signup link than by a calendar invite eight days out. The same scorecard that removes the bad fits can recognise this one and send it somewhere faster.",
      ],
      bullets: [
        "High fit, high urgency, small team - self-serve signup",
        "High fit, larger team or a security review - a sales demo",
        "Good fit, no timeline - nurture rather than a demo slot",
        "Out-of-scope use case - an honest page saying so",
      ],
    },
    {
      id: "ads",
      heading: "Feed the qualified demo requests back to the ad platform",
      answer:
        "A campaign optimised on form fills will reliably find more people who fill in forms, and fewer who buy.",
      paragraphs: [
        "This trap is specific to SaaS, because demo-request volume looks like success on every dashboard right up until the pipeline review. Reporting the qualified subset as the conversion event changes what the platform goes looking for, and it is the highest-leverage single change available to a team buying traffic.",
      ],
      bullets: [],
    },
  ],
  cta: {
    heading: "Score the demo request before it reaches the calendar",
    body: "Qualified accounts get a slot, strong self-serve fits get a signup link, and the rest get an honest answer instead of a wasted week.",
  },
};
