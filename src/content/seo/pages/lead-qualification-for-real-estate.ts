import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "lead-qualification-for-real-estate",
  kind: "use-case",
  intent:
    "An agent or developer paying for property enquiries and finding most of them are browsing, unfinanced, or looking in a different price band, wanting to sort them before calling.",
  primaryKeyword: "lead qualification for real estate",
  secondaryKeywords: [
    "real estate lead qualification",
    "property lead qualification",
    "qualify real estate leads",
    "real estate lead screening",
  ],
  title: "Lead Qualification for Real Estate",
  description:
    "How agents and developers sort property enquiries on timeline, finance and price band before calling, so the follow-up goes to buyers who can actually transact.",
  h1: "Assess360 for real estate: sort enquiries before you call",
  shortName: "For real estate",
  lede:
    "Property enquiries arrive in volume and almost all of them look the same: a name, a number, and an interest. Timeline, finance and price band are what separate a buyer from a browser, and all three can be asked before anybody picks up the phone.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "qualify-leads-before-sales-call", "scorecard"],
  sections: [
    {
      id: "three-facts",
      heading: "Timeline, finance and band decide everything",
      answer:
        "A buyer moving in three months with finance arranged is a different lead from one who might move next year, and the enquiry form cannot tell them apart.",
      paragraphs: [
        "Timeline is the strongest single signal in property, because it compresses motivation and circumstance into one answer. Finance is the second: pre-approved, in progress or not started changes what the next conversation should even be about.",
        "Price band is the one agents hesitate over, and it is the one that saves the most time. Someone looking two bands below what is available is not a lead to work, they are a lead to redirect.",
      ],
      bullets: [],
    },
    {
      id: "questions",
      heading: "What to ask a property enquiry",
      answer:
        "Five questions, none of which requires the person to feel interrogated, and all of which change who calls them and when.",
      paragraphs: [
        "These read naturally because they are the questions a buyer expects to be asked eventually. Asking them at the start simply means the first call is useful rather than exploratory.",
      ],
      bullets: [
        "When are you looking to move",
        "Where are you with finance - approved, in progress, or not yet started",
        "What price range are you working to",
        "Which areas are you considering",
        "Are you already working with another agent",
      ],
    },
    {
      id: "routing",
      heading: "Route by readiness, not by arrival time",
      answer:
        "Working leads in the order they arrive means a ready buyer waits behind twenty browsers.",
      paragraphs: [
        "A scored enquiry arrives already sorted, so the agent's morning starts with the people who can transact. Everyone else gets a result page with the listings or guidance that fits their actual position, which keeps them engaged without occupying a calling slot.",
        "On a paid campaign the same scoring feeds back to the ad platform, so the budget moves towards the enquiries that turned out to be real.",
      ],
      bullets: [],
    },
  ],
  cta: {
    heading: "Ask the three questions before the first call",
    body: "Put timeline, finance and band on the enquiry, score them, and let your team call in the order that reflects who can actually buy.",
  },
};
