import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "google-forms-alternative",
  kind: "comparison",
  intent:
    "A business running its enquiry intake on a free Google Form that now gets enough traffic for the spreadsheet to be unmanageable, and wants the sorting done before it reaches them.",
  primaryKeyword: "google forms alternative",
  secondaryKeywords: [
    "google forms alternative for lead qualification",
    "alternative to google forms for leads",
    "google forms vs assess360",
  ],
  title: "Google Forms Alternative for Lead Qualification",
  description:
    "How Assess360 differs from a Google Form: enquiries are scored, wrong-fit respondents stop before the opt-in, and each person gets a result.",
  h1: "Assess360 as a Google Forms alternative",
  shortName: "vs Google Forms",
  factsCheckedOn: "2026-10-06",
  lede:
    "A Google Form is free, quick and perfectly good at collecting answers into a spreadsheet. The trouble starts when the spreadsheet is the thing standing between your enquiries and your calendar, and somebody has to read it every morning.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "scorecard", "qualify-leads-before-sales-call"],
  sections: [
    {
      id: "spreadsheet",
      heading: "The spreadsheet is where the work piles up",
      answer:
        "Collecting answers is the easy half; deciding what they mean, consistently, for every row, is the half that does not scale.",
      paragraphs: [
        "Grading exists in a Google Form for quizzes with right answers, and that is not the same as weighting a business criterion: you are not marking a test, you are deciding whether this enquiry is worth an hour of someone's day.",
      ],
      bullets: [],
    },
    {
      id: "respondent",
      heading: "What the respondent gets back",
      answer:
        "A confirmation message, or a result that tells them where they stand and what to do next.",
      paragraphs: [
        "This is the part that changes answer quality. People answer carefully when the output is useful to them, and a form that ends in a thank-you gives them no reason to.",
      ],
      bullets: [
        "A scored result with a band, an explanation and a next step",
        "A gate that can end the run before any contact detail is stored",
        "Your own domain and branding rather than a shared form page",
        "Qualification sent back to the ad platform, if you are buying traffic",
      ],
    },
    {
      id: "fit",
      heading: "When the free form is the right call",
      answer:
        "When the volume is low enough to read, or when the form is internal and nobody is being filtered.",
      paragraphs: [
        "Nothing here says a free form is wrong. It says the moment the reading becomes a job, the tool has stopped matching the task.",
      ],
      bullets: [],
    },
  ],
  cta: {
    heading: "Let the enquiries sort themselves",
    body: "Score the same questions you already ask, and swap the confirmation screen for a result worth answering honestly for.",
  },
};
