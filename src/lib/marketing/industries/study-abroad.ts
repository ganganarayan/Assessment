import { defineIndustry } from "./define";

/**
 * Study-abroad consultancies. The first by-industry page written, and the one
 * every later page's structure came from.
 */
export const STUDY_ABROAD = defineIndustry({
  key: "study-abroad",
  shortName: "Study abroad consultancies",
  category: "Overseas education",
  keywordSlug: null,
  featured: true,
  cardLine:
    "Funds, scores, intake and the decision-maker, settled before the enquiry becomes a lead.",
  meta: {
    title: "Lead qualification for study abroad consultancies",
    description:
      "Enquiry volume is never the problem in an intake season. Applications are. Assess360 gates every student enquiry on funds, scores, intake and decision-maker before the opt-in, then teaches your ad account to stop finding the rest.",
  },
  hero: {
    headline:
      "The enquiries with no funds and no intake never become leads. And your ads learn to stop finding them.",
    sub: "Proof of funds, academic scores, intake and target country are settled before the opt-in, so an enquiry your counsellors would refuse in week three never becomes a record in week one. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the enquiry and the application",
  businesses: "consultancies",
  rivals: "your competitors",
  promiseWords:
    "an assessment, an eligibility check, a profile evaluation, a grade or an analysis",
  gainNoun: "students",
  neverVerb: "can never enrol",
  leak: {
    lead: "You are not short of enquiries in an intake season. You are paying for students who were never going to apply, in ad spend first and counsellor hours second. Here is that budget, and here is what it buys once it stops.",
    enquiriesLabel: "Student enquiries a month",
    enquiriesDefault: 180,
    outcomesLabel: "Enrolments a month today",
    outcomesDefault: 10,
    valueLabel: "What one enrolment is worth to you",
    valueHint: "Commission plus your own service fee, for one student who actually goes.",
    valueDefault: 120000,
    spendDefault: 150000,
    wrongFitHint:
      "No proof of funds, wrong intake, wrong country, scores nowhere near the bar, or a student whose parent has not agreed to any of it. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "two-thirds",
    unit: "enquiry",
    outcomeUnit: "enrolment",
    outcomeUnitPlural: "enrolments",
    caught: [
      {
        title: "The enquiry never becomes a lead.",
        body: "Funds, scores, intake and the decision-maker are asked before the opt-in. A student who cannot answer them is routed to an exit page, so no record is created, no counsellor opens a file, and there is nothing to clean out of the CRM once the intake closes.",
      },
      {
        title: "The students you do counsel arrive scored.",
        body: "You open the conversation already knowing the funds, the scores, the intake and whether the person who actually decides is in the room.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. Proof of funds, academic scores, intake and target country are asked while the visitor is still anonymous, and a student who cannot answer them never reaches the form. No lead record, no stored result, nothing for a counsellor to call.",
    score: "Everyone who passes is scored on the variables that actually decide an application: funds, scores, intake timing, target country and whether the person who signs the cheque is involved. They get a result that names where they stand and what to fix, which is why they finish it rather than abandoning it.",
    signalOpener: "Qualification saves your counsellors' week.",
    neverNoun: "the students who will never qualify",
    goodShape: "a student with funds and an intake",
    badShape: "somebody who fills in forms",
    optimisesToward: "students with funds and an intake",
  },
  costPer: { before: "Cost per enquiry", after: "Cost per application" },
  after: {
    brief:
      "Which countries and intakes you work, what a good student looks like, and which enquiries waste your counsellors' week.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted for study abroad rather than adapted from a generic template.",
    notOurJob: "We do not run your ads and we do not counsel your students.",
  },
  fit: {
    forList: [
      "You take 50 or more student enquiries a month",
      "Counsellor hours are your real constraint, not enquiry volume",
      "You run Meta or Google ads, or are about to",
      "You can say out loud which enquiries you do not want",
      "You are willing to send fewer students to your counsellors to get more applications out",
    ],
    notList: [
      "You want more enquiries, not fewer",
      "Your counsellors are idle and the volume is welcome",
      "You want somebody to run the ads for you. This is software you operate",
      "You cannot name a single answer that should disqualify a student",
      "You need the tool to find students rather than filter them",
    ],
  },
  objections: [
    {
      q: "Intake season is now. I cannot afford to turn enquiries away.",
      a: "You already turn them away. You do it in week three, after a counsellor has spent an hour on a student with no funds and a slot has gone to somebody who was never going to apply. The gate does it in the first ninety seconds and tells the student honestly what is missing, which is a better experience than being chased for documents that will never arrive.",
    },
    {
      q: "Students will not answer a question about money.",
      a: "Some will not, and that is the filter working. Ask it as eligibility rather than as means-testing, in bands rather than as a number, and the students with an application in them answer it. The ones who leave at that question were comparing four consultancies and had not spoken to a bank.",
    },
    {
      q: "We already have a CRM.",
      a: "Keep it. A CRM organises leads once they exist. This decides which enquiries get to exist at all, and pushes the qualified ones into your CRM by webhook with their score and their answers attached.",
    },
    {
      q: "Qualifying on the call is what counsellors are for.",
      a: "It is, and it is the most expensive minute in your business to spend on somebody with no funds. The call should open at counselling, not at screening. The scorecard arrives having already asked the questions your counsellor would have spent twenty minutes on.",
    },
    {
      q: "Will my lead volume in the ad account drop?",
      a: "Yes, deliberately, and cost per enquiry will rise with it. Watch cost per application instead. Meta learns from what you report as a conversion, so reporting only qualified completions is how the account stops buying the students your counsellors refuse.",
    },
  ],
  finalCta: {
    heading: "Fewer enquiries. More applications out the door.",
    sub: "We write the gate for your intakes, your countries and your bar, and take it live with you on one call.",
  },
});
