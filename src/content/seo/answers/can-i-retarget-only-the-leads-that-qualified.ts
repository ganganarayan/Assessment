import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "can-i-retarget-only-the-leads-that-qualified",
  question: "Can I retarget only the leads that qualified?",
  short:
    "Yes, if qualification is reported as its own event, because that event can be used to build a custom audience containing only the people who passed.",
  topicId: "meta-ads",
  primaryKeyword: "retarget qualified leads",
  secondaryKeywords: [
    "qualified lead custom audience",
    "retargeting audience lead quality",
    "lookalike from qualified leads",
  ],
  related: ["what-is-a-qualified-only-conversion-event", "how-do-i-exclude-unqualified-leads-from-meta-ads"],
  updatedAt: "2026-10-06",
  body: [
    {
      id: "why-it-matters",
      heading: "Retargeting everyone wastes the budget on the wrong half",
      answer:
        "A site-visitor audience contains the people you turned away as well as the people you want, and the budget is spread across both.",
      paragraphs: [
        "Most retargeting audiences are built on page views or on anyone who reached a thank-you page, which means they are dominated by the same unqualified traffic the campaign was already buying. The follow-up spend then goes back to the people least likely to buy.",
        "An audience built from the qualification event instead contains only people who met your criteria, so every impression is spent on someone worth converting.",
      ],
      bullets: [],
    },
    {
      id: "lookalikes",
      heading: "The better use is the lookalike",
      answer:
        "A lookalike built from qualified leads is a far stronger seed than one built from all leads, because the seed is the outcome you want.",
      paragraphs: [
        "This is where the compounding happens. The source audience defines what the platform goes looking for, and a source made of people who genuinely qualified describes your actual customer rather than your form-filling population.",
        "It takes time to accumulate enough qualified events to seed one, which is an argument for making the change early rather than after the next campaign.",
      ],
      bullets: [],
    },
  ],
};
