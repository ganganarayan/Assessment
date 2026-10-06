import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "lead-qualification-for-financial-advisors",
  kind: "use-case",
  intent:
    "A financial adviser or planning firm whose enquiries include people far below the minimum they can serve profitably, wanting to establish assets, goals and suitability before a first meeting.",
  primaryKeyword: "lead qualification for financial advisors",
  secondaryKeywords: [
    "financial advisor lead qualification",
    "financial planning lead screening",
    "qualify financial advice enquiries",
    "adviser enquiry form",
  ],
  title: "Lead Qualification for Financial Advisers",
  description:
    "How advice firms establish assets, goals and suitability before a first meeting, and why screening protects the prospect as much as the diary.",
  h1: "Assess360 for financial advisers: establish fit before the first meeting",
  shortName: "For financial advisers",
  lede:
    "Advice firms carry a minimum below which the relationship cannot be served properly, and a prospect under it is poorly served by being taken on. Establishing assets, horizon and goal before the first meeting protects both sides, and it is a conversation a form can start.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "qualify-leads-before-sales-call", "lead-scoring"],
  sections: [
    {
      id: "minimum",
      heading: "The minimum is a service question, not a snobbery question",
      answer:
        "Below a certain size the fee model does not work, and taking someone on anyway serves them worse than a referral would.",
      paragraphs: [
        "Most firms are uncomfortable asking about assets early, so they discover the answer in a meeting that then has to be wound up gracefully. Asked as a band on a form, it is ordinary, and it lets the firm route smaller enquiries to something that genuinely suits them.",
        "Framing matters. A band with a sensible lowest option reads as scoping; a free-text field asking for a number reads as a credit check.",
      ],
      bullets: [],
    },
    {
      id: "questions",
      heading: "What to ask before an advice meeting",
      answer:
        "Goal, horizon, rough size and whether anyone is already advising them - enough to decide who should take the meeting and what to prepare.",
      paragraphs: [
        "Each of these changes the meeting rather than merely filling a record. Someone retiring in two years and someone starting to invest need different people in the room, and knowing which beforehand is the difference between a good first meeting and a general one.",
      ],
      bullets: [
        "What are you trying to achieve, and by when",
        "Roughly what are you looking to invest or plan around",
        "Are you working with an adviser already",
        "Is this personal, business, or both",
        "What prompted you to look now",
      ],
    },
    {
      id: "compliance",
      heading: "Screening before contact keeps the record clean",
      answer:
        "An enquiry that is ruled out at the screening step never becomes a client record, a marketing contact, or a file to retain.",
      paragraphs: [
        "In a regulated setting, every stored enquiry is a record with obligations attached. On Assess360 a disqualifying answer ends the run before any contact detail is captured, so the firm holds data on the people it is actually engaging with and nobody else.",
        "Nothing here is advice, and the screening page should be written as scoping rather than as a recommendation about anyone's circumstances.",
      ],
      bullets: [],
    },
  ],
  cta: {
    heading: "Scope the enquiry before the diary fills",
    body: "Ask goal, horizon and rough size, route the ones you cannot serve to something that fits, and meet the rest already prepared.",
  },
};
