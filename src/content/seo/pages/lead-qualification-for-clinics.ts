import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "lead-qualification-for-clinics",
  kind: "use-case",
  intent:
    "A clinic or practice running ads for a treatment and filling its diary with enquiries that are not suitable, cannot travel, or expected the procedure to be covered, wanting to screen before the consultation slot is given away.",
  primaryKeyword: "lead qualification for clinics",
  secondaryKeywords: [
    "clinic lead qualification",
    "patient enquiry qualification",
    "healthcare lead qualification",
    "clinic consultation screening",
  ],
  title: "Lead Qualification for Clinics",
  description:
    "How clinics screen treatment enquiries on suitability, location and how the treatment is paid for, so consultation slots go to people who can proceed.",
  h1: "Assess360 for clinics: screen enquiries before the consultation slot",
  shortName: "For clinics",
  lede:
    "A consultation slot is the scarcest thing a clinic has, and an enquiry form gives it away to whoever fills in the form first. Screening on suitability, distance and how the treatment will be paid for means the diary holds people who can actually proceed.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "scorecard", "qualify-leads-before-sales-call"],
  sections: [
    {
      id: "suitability",
      heading: "Suitability is a clinical question asked in plain language",
      answer:
        "A screening question is not a diagnosis; it establishes whether a consultation is the right next step for this person at all.",
      paragraphs: [
        "Clinics already know which answers rule a treatment out: a condition that falls outside the service, a stage that needs a different pathway, an expectation the procedure cannot meet. Those are the questions that belong on the enquiry, written the way a patient would answer them rather than the way a clinician would record them.",
        "This is screening for an appointment, not medical advice, and the copy on the page should say so plainly. A disqualified enquiry deserves a route onward - to a GP, to a different service, to information - never a dead end.",
      ],
      bullets: [],
    },
    {
      id: "practicalities",
      heading: "Distance and payment decide as much as clinical fit",
      answer:
        "Someone three hours away, or expecting cover that does not apply, will not proceed however suitable they are.",
      paragraphs: [
        "These two questions remove more unworkable enquiries than any clinical screen, and neither is intrusive. Asking where someone is travelling from and whether they are self-funding is ordinary practice admin moved one step earlier.",
      ],
      bullets: [
        "How far are you willing to travel, and from where",
        "Is this self-funded, or are you expecting it to be covered",
        "How long has this been going on",
        "Have you had treatment for it before, and what happened",
        "How soon do you want to start",
      ],
    },
    {
      id: "privacy",
      heading: "A disqualified enquiry leaves no record",
      answer:
        "On Assess360 an answer that rules someone out ends the run before any contact detail is stored.",
      paragraphs: [
        "That matters more in healthcare than anywhere else. A person who answers two questions and is told the clinic is not the right fit has not handed over their details, so there is no record to hold, secure or delete, and nothing enters a marketing sequence they never consented to.",
        "The ad platform still learns from it, because the exclusion signal carries no personal information at all - which is the only form of feedback a clinic should be sending anyway.",
      ],
      bullets: [],
    },
  ],
  cta: {
    heading: "Protect the consultation diary",
    body: "Screen on suitability, distance and funding, give the people who do not fit a useful route onward, and keep the slots for those who can proceed.",
  },
};
