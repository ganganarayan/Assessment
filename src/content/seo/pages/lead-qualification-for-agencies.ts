import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "lead-qualification-for-agencies",
  kind: "use-case",
  intent:
    "An agency owner whose enquiry form is full of businesses too small to afford a retainer, looking for a way to find that out before the discovery call rather than during it.",
  primaryKeyword: "lead qualification for agencies",
  secondaryKeywords: [
    "agency lead qualification",
    "marketing agency lead qualification",
    "qualify agency leads",
    "agency lead scoring",
  ],
  title: "Lead Qualification for Agencies",
  description:
    "How a marketing agency screens enquiries on budget, spend and decision authority before the discovery call, and what to do with the ones that do not pass.",
  h1: "Assess360 for agencies: qualify before the discovery call",
  shortName: "For agencies",
  lede:
    "Agency discovery calls are expensive: an hour of senior time, usually with someone who cannot sign. Qualification moves the three facts that decide the outcome - budget, authority and current spend - ahead of the call, so the calendar fills with businesses that can actually buy.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "qualify-leads-before-sales-call", "lead-scoring"],
  sections: [
    {
      id: "disqualifiers",
      heading: "What actually disqualifies an agency lead",
      answer:
        "Almost always one of three things: no budget at the retainer floor, no authority to sign, or an expectation the agency does not sell.",
      paragraphs: [
        "Every agency knows its floor. The problem is that the floor is never on the enquiry form, so it gets discovered on the call, by which point an hour is gone and a polite exit has to be managed. Putting the floor into a screening question costs nothing and ends the conversation before it starts.",
        "Authority is the one most agencies skip, because asking it feels rude. It is not rude on a scorecard: it is a question about how decisions get made, and the answer decides who should be on the call.",
      ],
      bullets: [
        "Monthly budget below the retainer floor",
        "The enquirer cannot approve spend, and no sponsor is named",
        "Wants a one-off project when the agency sells retainers",
        "An industry the agency does not serve, or a competitor of a current client",
        "Expects work inside an ad account the agency will not be given access to",
      ],
    },
    {
      id: "questions",
      heading: "The questions worth asking an agency prospect",
      answer:
        "Five or six, each one a fact that changes whether the call should happen, rather than a questionnaire about their goals.",
      paragraphs: [
        "Goals are what the call is for. Screening questions exist to decide whether the call happens at all, so each one has to be capable of ending the conversation. If an answer cannot disqualify and cannot move the score, it belongs on the call, not on the form.",
      ],
      bullets: [
        "What are you spending on ads each month right now",
        "Who signs off on a new supplier",
        "Are you looking for ongoing work or a single project",
        "What have you tried already, and what came of it",
        "When do you need this running by",
      ],
    },
    {
      id: "the-ones-who-fail",
      heading: "What to do with the leads that do not qualify",
      answer:
        "Send them somewhere useful rather than nowhere: a resource, a lower-priced offer, or an honest page explaining who the agency is built for.",
      paragraphs: [
        "A disqualified enquiry is not a wasted one. The person was interested enough to answer, and an honest exit page serves them better than a thank-you message implying a call is coming when it is not.",
        "On Assess360 a disqualifying answer ends the run before a lead record exists, so the CRM stays clean and the sales team never sees a row it was never going to call. What does leave is an exclusion signal to the ad platform, which is the point: the campaign stops paying to find more of the same.",
      ],
      bullets: [],
    },
  ],
  cta: {
    heading: "Put your retainer floor on the first screen",
    body: "Build the scorecard, publish it as the link in your ads and your site's enquiry button, and let it decide who reaches your calendar.",
  },
};
