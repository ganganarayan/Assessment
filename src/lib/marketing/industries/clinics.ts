import { defineIndustry } from "./define";

/**
 * Aesthetic and elective clinics.
 *
 * Distinct from the keyword page at /lead-qualification-for-clinics: that one
 * answers a search, this one is where an emailed funnel audit lands. Same
 * product, different reader, which is why only this one leads with the audit and
 * the arithmetic.
 */
export const CLINICS = defineIndustry({
  key: "clinics",
  shortName: "Aesthetic and elective clinics",
  category: "Clinics",
  keywordSlug: "lead-qualification-for-clinics",
  featured: true,
  cardLine:
    "Budget, treatment intent, timeline and location, settled before the enquiry becomes a lead.",
  meta: {
    title: "Lead qualification for aesthetic and elective clinics",
    description:
      "Price-shoppers cost the same per click as patients. Assess360 settles budget, treatment intent, timeline and location before the opt-in, scores everyone who passes, and teaches your ad account to stop finding the rest.",
  },
  hero: {
    headline:
      "The price-shoppers never become leads. And your ads learn to stop finding them.",
    sub: "Budget, treatment intent, timeline and location are settled before the opt-in, so the enquiry your coordinator would lose a morning to never becomes a name on the list. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the enquiry and the chair",
  businesses: "clinics",
  rivals: "clinics down the road",
  promiseWords:
    "an assessment, a suitability check, a candidacy evaluation, a grade or an analysis",
  gainNoun: "patients",
  neverVerb: "can never book",
  leak: {
    lead: "A price-shopper and a patient cost the same per click. One of them can never book. Here is what that costs you in ad spend every month, and what the same budget buys once it stops being spent on them.",
    enquiriesLabel: "Patient enquiries a month",
    enquiriesDefault: 150,
    outcomesLabel: "Completed treatments a month today",
    outcomesDefault: 12,
    valueLabel: "What one completed treatment is worth to you",
    valueHint: "The average, across whatever mix of treatments you actually do.",
    valueDefault: 60000,
    spendDefault: 125000,
    wrongFitHint:
      "Only asking the price, nowhere near the budget, wrong city, not deciding this year, or a treatment you do not perform. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "two-thirds",
    unit: "enquiry",
    outcomeUnit: "treatment",
    outcomeUnitPlural: "treatments",
    caught: [
      {
        title: "The enquiry never becomes a lead.",
        body: "Budget band, treatment intent, timeline and location are asked before the opt-in. A visitor who cannot answer them is routed to an exit page, so no record is created, no consultation is offered, and your coordinator's morning stays her own.",
      },
      {
        title: "The patients you do see arrive scored.",
        body: "You open the consultation already knowing the budget band, the treatment they want and when they intend to have it, so the conversation starts at clinical rather than at commercial.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. Budget band, treatment intent, timeline and location are asked while the visitor is still anonymous, and anyone who fails never reaches the form. No lead record, no stored result, no consultation to reschedule.",
    score: "Everyone who passes is scored on the four variables that decide whether a treatment happens: budget, intent, timeline and location. They get a result that names where they stand and what the honest next step is, which is why they finish it instead of abandoning it halfway.",
    signalOpener: "A gate saves your coordinator's morning.",
    neverNoun: "the people who will never book",
    goodShape: "a patient who can pay",
    badShape: "somebody who asks the price",
    optimisesToward: "patients who can pay and intend to book",
  },
  costPer: { before: "Cost per lead", after: "Cost per completed treatment" },
  after: {
    brief:
      "Which treatments you want more of, the budget below which you would rather not take the call, and what wastes your coordinator's morning.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted for an elective-treatment enquiry rather than adapted from a generic template.",
    notOurJob: "We do not run your ads and we do not touch anything clinical.",
  },
  fit: {
    forList: [
      "You take 50 or more enquiries a month",
      "Your coordinator's morning goes on working out who is serious",
      "A wrong-fit consultation costs you a slot you cannot resell",
      "You run Meta or Google ads, or are about to",
      "You can name the budget below which you would rather not take the call",
    ],
    notList: [
      "You want more enquiries, not fewer",
      "You discount to close, and would rather keep doing that than qualify",
      "You want somebody to run the ads for you. This is software you operate",
      "Your chairs are empty and any enquiry is welcome",
      "You cannot name a single answer that should disqualify an enquiry",
    ],
  },
  objections: [
    {
      q: "Turning enquiries away in this market? No.",
      a: "You turn them away already. You do it after your coordinator has spent the morning, after a consultation slot has gone unfilled, and sometimes after a discount was offered to somebody who was never going to book. The gate does it in the first ninety seconds, before anyone has spent anything.",
    },
    {
      q: "Patients will not tell me their budget.",
      a: "Ask it as a treatment range rather than as a budget, in bands rather than as a figure, and the ones who intend to go ahead answer it. The people who leave at that question were pricing four clinics and had not decided to have the treatment at all.",
    },
    {
      q: "My front desk already filters the enquiries.",
      a: "Inconsistently, and differently on a Saturday than on a Monday. A gate asks every enquiry the same questions in the same order, never has a bad morning, and does it before the enquiry becomes a name somebody feels obliged to call back.",
    },
    {
      q: "Our problem is consultation no-shows, not bad leads.",
      a: "Those are one problem seen from two ends. A consultation booked by somebody who could not afford it, or was not deciding this year, is the no-show. Qualify before the booking and the diary stops carrying appointments that were never going to be kept.",
    },
    {
      q: "Is my cost per lead going to go up?",
      a: "Yes. That is what happens when you stop counting the cheap ones. The number worth watching is cost per completed treatment, and the point of reporting only qualified completions to Meta is that the account starts optimising for exactly that.",
    },
  ],
  finalCta: {
    heading: "Fewer enquiries. More chairs filled.",
    sub: "We write the gate for your treatments, your budget bar and your city, and take it live with you on one call.",
  },
});
