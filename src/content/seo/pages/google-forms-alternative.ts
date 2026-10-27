import type { SeoPage } from "@/lib/seo/types";
import { caps, lacks } from "../capabilities";

export const page: SeoPage = {
  slug: "google-forms-alternative",
  kind: "comparison",
  intent:
    "A business running its enquiry intake on a free Google Form that now gets enough traffic for the spreadsheet to be unmanageable, and wants the sorting done before it reaches them, while understanding what a free unmetered form was actually giving them.",
  primaryKeyword: "google forms alternative",
  secondaryKeywords: [
    "google forms alternative for lead qualification",
    "alternative to google forms for leads",
    "google forms vs assess360",
  ],
  title: "Google Forms Alternative for Lead Qualification",
  description:
    "Assess360 against a Google Form: per-answer scoring, bands, a gate before the opt-in and server-side ad reporting, against free and unmetered.",
  h1: "Assess360 as a Google Forms alternative",
  shortName: "vs Google Forms",
  factsCheckedOn: "2026-10-27",
  lede:
    "A Google Form is free, quick and perfectly good at collecting answers into a spreadsheet, and on volume and price nothing here competes with it. The trouble starts when the spreadsheet is the thing standing between your enquiries and your calendar, and when paid traffic lands on a page that can fire nothing at all back to the ad account.",
  updatedAt: "2026-10-27",
  internalLinks: ["lead-qualification-software", "scorecard", "qualify-leads-before-sales-call"],
  sections: [
    {
      id: "spreadsheet",
      heading: "The spreadsheet is where the work piles up",
      answer:
        "Collecting answers is the easy half; deciding what they mean, consistently, for every row, is the half that does not scale.",
      paragraphs: [
        "Grading exists in a Google Form for quizzes with right answers, and that is not the same as weighting a business criterion: you are not marking a test, you are deciding whether this enquiry is worth an hour of someone's day.",
        "The mechanics make the point better than the principle does. Points in a Google Form are per question, not per answer option, so you cannot say that this answer is worth four and that one is worth minus two. There are no score bands, no category subscores, and one confirmation message for everybody, so there is nowhere for a verdict to go even if you could calculate one.",
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
        "Qualification sent back to the ad platform, server-side, if you are buying traffic",
      ],
    },
    {
      id: "fit",
      heading: "When the free form is the right call",
      answer:
        "When the volume is low enough to read, when the form is internal, when nobody is being filtered, or when you need a file upload and a thousand responses for nothing.",
      paragraphs: [
        "Nothing here says a free form is wrong. It says the moment the reading becomes a job, the tool has stopped matching the task. And it is worth being clear about what the free form still wins on: file uploads straight into your Drive, grids and linear scales, URL prefill, thirty-day respondent drafts, up to half a million responses per form at no cost, and HIPAA and ISO coverage through Workspace that we cannot match at any price.",
      ],
      bullets: [],
    },
    {
      id: "when-free-stops-being-free",
      heading: "When free stops being free",
      answer: "The subscription is not where a Google Form costs you money. The invisibility is.",
      paragraphs: [
        "Two things are missing and only one of them is obvious. The obvious one is that it cannot qualify: every respondent arrives looking identical and somebody sorts them by hand.",
        "The one that costs more is that it cannot report. There is no field for a pixel, a script or a tracking tag anywhere in a Google Form, no Conversions API, no Google Analytics hook and no Google Ads conversion, which is quietly remarkable given who makes it. If paid traffic is landing on a Google Form your ad account has no idea what happened after the click and is optimising on a guess. That is money leaving every day with no line item anywhere.",
      ],
      bullets: [
        "Disqualified visitors leave no lead record, so nothing reaches your CRM to be cleaned out later",
        "A qualified-only conversion event, so the algorithm optimises toward people who passed rather than people who typed fast",
        "An exclusion audience that grows by itself, so you stop paying to reach the people you just turned away",
      ],
    },
  ],
  parity: {
    intro:
      "Everything a Google Form does for your intake, this does, which on this page is the easy half of the argument. The list is here so you can check it rather than take it on trust, and so the few things the free form does better stand out properly in the section below.",
    items: caps(
      "points",
      "weights",
      "bands",
      "logic",
      "pacing",
      "resultPage",
      "pdf",
      "resultLink",
      "redirect",
      "captureOrder",
      "domain",
      "branding",
      "templates",
      "importer",
      "resume",
      "retakes",
      "webhooks",
      "export",
      "submissions",
      "emailSending",
      "pixel",
      "stats",
      "utm",
      "seats",
    ),
  },
  limits: {
    intro:
      "This is the page where our absences matter least and our price matters most, so both deserve stating plainly. Google Forms genuinely beats us on volume, on cost, on file uploads, on question types and on compliance, and the first two are not close.",
    items: lacks(
      "freePlan",
      "volume",
      "fileUpload",
      "questionTypes",
      "prefill",
      "embeds",
      "compliance",
      "accessibility",
      "zapier",
      "annual",
    ),
  },
  comparison: {
    competitor: "Google Forms",
    source: "read from Google's own help centre and Workspace pricing documentation on 27 October 2026. Google's pricing page serves different currencies and plan names by region",
    rows: [
      {
        label: "Gate runs before the opt-in",
        us: "Yes. A disqualifying answer stores no lead, no submission and no result, and fires an exclusion event.",
        them: "A disqualifying answer can jump to Submit before a later section asks for contact details, but the submission is still recorded.",
      },
      {
        label: "Points per answer option",
        us: "Yes. Each option carries the score you give it, with a weight per question.",
        them: "No. Quiz points are per question, in the answer key. An individual option cannot carry its own value.",
      },
      {
        label: "Named score bands and a result per band",
        us: "Yes. Bands overall and per category, each with its own message and next step.",
        them: "No. A quiz produces one total, and there is one confirmation message for everybody.",
      },
      {
        label: "Anything at all reported to an ad platform",
        us: "Pixel and server-side Conversions API, deduplicated, on every paid plan.",
        them: "Nothing. No pixel, no script field, no Conversions API, no Analytics hook and no Google Ads conversion.",
      },
      {
        label: "Custom domain and your branding",
        us: "Yes, from $79/mo, on your own domain with our badge removed.",
        them: "No. The form lives on a Google URL, and there is no documented way to remove Google Forms branding on any tier.",
      },
      {
        label: "Conditional logic",
        us: "Answer-based skip, jump, converge and cascade into a different assessment.",
        them: "Section branching from a multiple-choice or dropdown answer, free on every tier. Simpler, but real.",
        tie: true,
      },
      {
        label: "Answers survive a closed tab",
        us: "Answers autosave, and re-entering the same email picks the run back up.",
        them: "Thirty-day respondent drafts for anybody signed in to a Google account. Theirs is the longer window.",
        tie: true,
      },
      {
        label: "Export and a place to read the data",
        us: "A searchable submissions table, CSV export on every plan, and signed webhooks.",
        them: "A live link to Sheets, which for a lot of businesses is the better answer. No arbitrary webhook URL.",
        tie: true,
      },
      {
        label: "File uploads from the respondent",
        us: "No. Nothing can be uploaded.",
        them: "Yes, straight into the form owner's Drive.",
        themWins: true,
      },
      {
        label: "Question types",
        us: "Two: single-select and free text.",
        them: "Twelve, including checkboxes, grids, linear scale, rating, date, time and file upload.",
        themWins: true,
      },
      {
        label: "Price and volume",
        us: "No free plan. 14 days of the full product, then $39/mo for 150 qualified responses.",
        them: "Free, with no plan response limit at all, up to 500,000 responses per form. Nothing here competes with that.",
        themWins: true,
      },
      {
        label: "Compliance paperwork",
        us: "None. No BAA, no SOC 2, no ISO, no DPA.",
        them: "Forms sits inside the Workspace BAA for HIPAA, and Workspace carries SOC 2, SOC 3 and ISO 27001, 27017 and 27018 with a published data processing addendum.",
        themWins: true,
      },
    ],
  },
  betterWhen:
    "Keep the Google Form for anything internal, anything low volume, anything that needs a file upload, and anything where you genuinely want every response. It is free, it is unmetered up to half a million responses per form, it writes straight into Sheets, and through Workspace it carries HIPAA and ISO coverage we cannot offer at any price. The only thing it cannot do is judge an enquiry and tell an ad platform what the judgement was, and that is the entire reason to look elsewhere.",
  faqs: [
    {
      q: "Can I not just add scoring to a Google Form?",
      a: "Only in the sense a quiz is scored: points are set per question in the answer key, not per answer option, so you cannot weight one answer differently from another within the same question. There are no score bands, no category subscores and one confirmation message for everyone. The workarounds all end in Apps Script, at which point you are maintaining software rather than using a form.",
    },
    {
      q: "Why does a Google Form hurt a paid campaign?",
      a: "Because nothing can be fired from it. There is no field for a pixel, a tag or a script, no Conversions API, no Analytics integration and no Google Ads conversion action, so the ad platform learns nothing after the click and optimises on whoever clicks. You are paying for traffic and withholding the one piece of feedback that would make the next pound cheaper.",
    },
    {
      q: "Is this not far more expensive than free?",
      a: "Yes, and on volume it is not close: a Google Form takes half a million responses per form for nothing, where $39 here buys 150 qualified ones a month. The argument only works the other way round if a wrong-fit enquiry costs you an hour of somebody's time. If it costs you a row in a spreadsheet, keep the form, and we would rather tell you that than sell you something.",
    },
    {
      q: "Can I move my Google Form across?",
      a: "Multiple-choice and short-answer questions move by pasting them into the plain-text importer. Checkboxes, grids, linear scales and file uploads do not, because we have no equivalent. Send us the live link and we will rebuild it as a scored funnel with a gate in front of it, free, then take it live with you on one 30-minute call.",
    },
  ],
  cta: {
    heading: "Let the enquiries sort themselves",
    body: "Keep the spreadsheet for everything else, and put one scored funnel in front of the enquiries that cost you time.",
  },
};
