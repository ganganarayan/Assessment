import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "lead-qualification-for-insurance-brokers",
  kind: "use-case",
  intent:
    "An insurance broker or agency buying enquiries and finding most are outside the products they place, outside the territory they are licensed in, or shopping a renewal months away.",
  primaryKeyword: "lead qualification for insurance brokers",
  secondaryKeywords: [
    "insurance lead qualification",
    "broker enquiry screening",
    "qualify insurance leads",
    "insurance lead scoring",
  ],
  title: "Lead Qualification for Insurance Brokers",
  description:
    "How brokers screen enquiries on product, territory and renewal date before quoting, so the quoting effort goes where a policy can actually be placed.",
  h1: "Assess360 for insurance brokers: screen before you quote",
  shortName: "For insurance brokers",
  lede:
    "Quoting is the work, and it is given away on enquiries that could never be placed: the wrong product, a territory the broker is not appointed in, or a renewal eight months out. Three questions settle all of it before anyone opens a quoting system.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "lead-scoring", "qualify-leads-before-sales-call"],
  sections: [
    {
      id: "placeable",
      heading: "Ask whether the risk is placeable at all",
      answer:
        "Product, territory and risk profile decide whether this enquiry can become a policy, and all three are form questions.",
      paragraphs: [
        "Brokers carry an unwritten list of what they will not place, and it stays unwritten, so every new enquiry is assessed by whoever opens it. Putting the list into the screening questions makes the rule consistent and removes the enquiries nobody was going to be able to help.",
      ],
      bullets: [],
    },
    {
      id: "timing",
      heading: "Renewal date decides when, not whether",
      answer:
        "An enquiry eight months from renewal is real but not now, and treating it as today's work costs the quote that is due this week.",
      paragraphs: [
        "This is the one question that turns a scorecard into a scheduler. A renewal date in the answers means the enquiry can be scored as a future opportunity, held, and surfaced at the right moment, rather than quoted immediately at a price that will have changed by the time it matters.",
      ],
      bullets: [
        "What cover are you looking for",
        "Where are you based, and where is the risk",
        "When does your current policy renew",
        "Have you had a claim in the last three years",
        "Are you buying for yourself or for a business",
      ],
    },
    {
      id: "no-advice",
      heading: "Screening is not advice, and the page should say so",
      answer:
        "A qualification page establishes whether a conversation is possible; it does not recommend a product to anyone.",
      paragraphs: [
        "That distinction matters in a regulated market, and it is easy to hold onto: the result page says what happens next and who will be in touch, not which policy the person should buy.",
        "An enquiry that rules itself out ends the run before contact details are stored, so the broker holds data only on the people it is genuinely engaging with.",
      ],
      bullets: [],
    },
  ],
  cta: {
    heading: "Quote the enquiries you can place",
    body: "Screen on product, territory and renewal date, hold the future ones until they are live, and spend the quoting hours on this week's business.",
  },
};
