import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "why-does-cost-per-lead-go-up-when-lead-quality-improves",
  question: "Why does my cost per lead go up when lead quality improves?",
  short:
    "Because you changed what you are counting: a qualified lead is rarer than a form fill, so the same spend buys fewer of them and each one costs more and is worth more.",
  topicId: "meta-ads",
  primaryKeyword: "cost per lead went up after qualification",
  secondaryKeywords: [
    "cost per qualified lead",
    "lead quality vs cost per lead",
    "qualification lower lead volume",
  ],
  related: ["what-is-a-qualified-only-conversion-event", "why-do-my-ads-produce-unqualified-leads"],
  updatedAt: "2026-10-06",
  body: [
    {
      id: "different-denominator",
      heading: "You are measuring a different thing",
      answer:
        "The old number counted everyone who submitted; the new one counts only the people worth calling, and those are not the same population.",
      paragraphs: [
        "A campaign that produced two hundred leads at five pounds and a campaign that produces forty qualified leads at twenty-five pounds can be the same campaign on the same budget. The second one has simply stopped counting the hundred and sixty people the sales team was never going to sell to.",
        "If the comparison is made on cost per lead, the better campaign always loses. That metric was only ever a proxy, and qualification is what exposes it as one.",
      ],
      bullets: [],
    },
    {
      id: "what-to-watch",
      heading: "What to watch instead",
      answer:
        "Cost per qualified lead, the qualification rate, and the cost per sale - in that order of availability.",
      paragraphs: [
        "Qualification rate is the most useful number nobody tracks: the share of traffic that clears the bar. It tells you whether a creative is attracting the right people long before the sales data arrives, and it separates a targeting problem from an offer problem.",
      ],
      bullets: [
        "Cost per qualified lead, not cost per lead",
        "Qualification rate by campaign, ad set and creative",
        "Sales team hours saved, which is the cost the old metric hid",
        "Cost per sale, once there is enough volume to read it",
      ],
    },
    {
      id: "patience",
      heading: "Give the campaign time to re-learn",
      answer:
        "Delivery needs a number of the new events before it settles, so the first week after the change is a learning phase, not a result.",
      paragraphs: [
        "Judging the switch in the first few days compares a system that is still exploring with one that had been optimised for months. The honest comparison starts once the new event is being produced at a steady rate.",
      ],
      bullets: [],
    },
  ],
};
