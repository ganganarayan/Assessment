import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "lead-qualification-for-home-services",
  kind: "use-case",
  intent:
    "A contractor, installer or home improvement business paying for enquiries and sending vans to quote jobs that were outside the service area, below the minimum job size, or not the owner's decision to make.",
  primaryKeyword: "lead qualification for home services",
  secondaryKeywords: [
    "contractor lead qualification",
    "home improvement lead screening",
    "qualify home services leads",
    "trade enquiry form",
  ],
  title: "Lead Qualification for Home Services",
  description:
    "How contractors and installers screen enquiries on service area, job size, ownership and timing, so a site visit is only spent on jobs worth quoting.",
  h1: "Assess360 for home services: qualify before the van leaves",
  shortName: "For home services",
  lede:
    "A site visit costs a half day and the fuel to get there, and most trades give them away on the strength of a phone number. Service area, job size, who owns the property and when the work is wanted are four answers that decide whether the visit is worth making.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "scorecard", "qualify-leads-before-sales-call"],
  sections: [
    {
      id: "visit-cost",
      heading: "The site visit is the thing being protected",
      answer:
        "Every unqualified visit is half a day that could have been spent on a job that was going to happen.",
      paragraphs: [
        "In most trades the diary is the constraint, not the lead volume. That inverts the usual advice: the goal is not more enquiries, it is fewer visits to jobs that were never going to be booked.",
        "Four questions remove most of them, and none of the four feels like an interrogation to someone who genuinely wants the work done.",
      ],
      bullets: [],
    },
    {
      id: "questions",
      heading: "What to ask before booking a visit",
      answer:
        "Postcode, scope, ownership and timing, plus a budget band when the work varies widely in price.",
      paragraphs: [
        "Ownership is the one trades most often skip and regret. A tenant cannot authorise structural work, and a visit arranged with someone who has to ask the landlord is a visit arranged twice.",
      ],
      bullets: [
        "Where is the property",
        "What needs doing, in your own words",
        "Do you own the property",
        "When would you want the work done",
        "Is this going through insurance",
      ],
    },
    {
      id: "out-of-area",
      heading: "Give an out-of-area enquiry a real answer",
      answer:
        "A page that says plainly where the firm works beats a quote that never arrives.",
      paragraphs: [
        "Someone outside the service area is not a bad person to have reached, they are simply someone the business cannot serve. An exit page that says so, and points them at what to look for in whoever they hire instead, costs nothing and ends the enquiry cleanly.",
        "On a paid campaign that same answer tells the ad platform to stop buying clicks from that area, which is where the saving compounds.",
      ],
      bullets: [],
    },
  ],
  cta: {
    heading: "Protect the diary, not the lead count",
    body: "Screen on area, scope, ownership and timing, and send the van to the jobs that were going to be booked.",
  },
};
