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
  factsCheckedOn: "2026-10-09",
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
    {
      id: "when-free-stops-being-free",
      heading: "When free stops being free",
      answer: "The subscription is not where a Google Form costs you money. The invisibility is.",
      paragraphs: [
        "Two things are missing and only one of them is obvious. The obvious one is that it cannot qualify: every respondent arrives looking identical and somebody sorts them by hand.",
        "The one that costs more is that it cannot report. No pixel, no Conversions API, no event of any kind, so if paid traffic is landing on a Google Form your ad account has no idea what happened after the click and is optimising on a guess. That is money leaving quietly, every day, with no line item anywhere.",
      ],
      bullets: [
        "Disqualified visitors leave no lead record, so nothing reaches your CRM to be cleaned out later",
        "A qualified-only conversion event, so the algorithm optimises toward people who passed rather than people who typed fast",
        "An exclusion audience that grows by itself, so you stop paying to reach the people you just turned away",
      ],
    },
  ],
  comparison: {
    competitor: "Google Forms",
    source: "Google's published pricing, October 2026",
    rows: [
    {
      label: "Gate runs before the opt-in",
      us: "Yes, before the opt-in. A failed gate stores no lead, no submission and no result.",
      them: "No. Sections and branching exist, but everyone reaches the form.",
    },
    {
      label: "Are disqualified visitors metered?",
      us: "Never. Only qualified responses count against the plan.",
      them: "No metering at all.",
    },
    {
      label: "Weighted category scoring",
      us: "Yes. Weighted categories, a weighted total, and named result bands.",
      them: "Quiz scoring for right and wrong answers. No weighted fit scoring.",
    },
    {
      label: "Qualified-only conversion event",
      us: "Yes. Qualified completions fire their own conversion event.",
      them: "No conversion events of any kind.",
    },
    {
      label: "Server-side exclusion audience",
      us: "Yes. Server-side exclusion audience via the Conversions API.",
      them: "No server-side exclusion audience.",
    },
    {
      label: "First-party match keys",
      us: "Yes, on every Pixel and CAPI event.",
      them: "No pixel or Conversions API support.",
    },
    {
      label: "Custom domain",
      us: "Yes, from $79/mo.",
      them: "No.",
    },
    {
      label: "Entry price",
      us: "$39/mo, or $32 billed annually.",
      them: "Free.",
      themWins: true,
    },
    ],
  },
  betterWhen:
    "Google Forms is free, everybody already has it, and for an internal signup, an event RSVP or a quick survey it is the correct choice and always will be. Nothing here is an argument against using it for those. It only becomes the wrong tool when a form is the front door of a business that buys traffic, because at that point it cannot tell you who is worth calling and cannot tell your ad account anything at all.",
  faqs: [
    {
      q: "Why pay when Google Forms is free?",
      a: "You would not, until the form starts costing you something other than money. The question is what an hour on a wrong-fit call is worth and how many of them a month you take. Below a certain number, Google Forms is the rational answer and we would rather say so.",
    },
    {
      q: "Can Google Forms track my ads?",
      a: "No. There is no pixel, no Conversions API and no event of any kind, so a Google Form sitting behind paid traffic is a funnel your ad account cannot see into. Every optimisation decision after that is made on partial data.",
    },
    {
      q: "Can I move my Google Form across?",
      a: "Yes, in minutes. Paste the questions into the plain-text importer. The gate and the weights are the new parts, and we will write them for you free if you send us the link, then take it live with you on one 30-minute call.",
    },
  ],
  cta: {
    heading: "Let the enquiries sort themselves",
    body: "Score the same questions you already ask, and swap the confirmation screen for a result worth answering honestly for.",
  },
};
