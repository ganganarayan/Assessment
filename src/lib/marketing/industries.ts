// ============================================================================
//  By-industry pages. One file for both: all copy, every tunable, one place.
// ============================================================================
//
//  These are the pages an emailed funnel audit lands on. They are NOT a second
//  product and not a different template: the chrome, the type scale and the
//  spacing all come from the same marketing components the home page uses, and
//  the offer, the slot count and the call to action are READ from content.ts
//  rather than restated here. That is the whole reason this file holds only
//  industry words: a figure or a CTA label typed into a page is a figure that
//  will eventually disagree with the one in the announcement bar above it.
//
//  🔴 Nothing in here may describe a service. Assess360 is software the customer
//  operates: no done-for-you marketing, no retainer, no leads sold by the piece.
//  The one thing we do for them is build the first scorecard with them on a call,
//  which is the DFY offer that already exists on every other public surface.

import { DFY, HERO, MARKETING, OFFER_SLOTS } from "./content";

/**
 * The call to action, in one place, and deliberately the SAME one the landing
 * page hero carries.
 *
 * An industry page with a CTA of its own would split the funnel: two different
 * asks, two different conversion events, and an announcement bar above the fold
 * promising a third thing. So the primary action is the free build, the
 * secondary is the trial, and both labels come from the constants the home page
 * already renders.
 */
export const INDUSTRY_CTA = {
  primaryHref: DFY.href,
  primaryLabel: DFY.cta,
  secondaryHref: MARKETING.signupHref,
  secondaryLabel: HERO.secondaryCta,
} as const;

/** The eyebrow is the category, and it is the same category on every page. */
export const INDUSTRY_EYEBROW = HERO.eyebrow;

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

/**
 * How many of every hundred enquiries can never buy, as a band.
 *
 * A band rather than a free number, for the same reason the cosmetic page uses
 * one: nobody knows their wrong-fit percentage, everybody knows whether it is
 * most of them or about half. The band prefills a number input the visitor can
 * then override, so the honest answer and the exact answer both have a path.
 */
export const WRONG_FIT_BANDS = [
  { id: "most", label: "Most of them", pct: 75 },
  { id: "two-thirds", label: "About two in three", pct: 65 },
  { id: "half", label: "About half", pct: 50 },
  { id: "third", label: "About one in three", pct: 33 },
] as const;

export type WrongFitBandId = (typeof WRONG_FIT_BANDS)[number]["id"];

/**
 * 🔴 THE ONE MODELLED ASSUMPTION ON THESE PAGES, AND IT IS DELIBERATELY LOW.
 *
 * Of the ad spend currently buying traffic that can never buy, the model
 * reclaims this share and no more. An exclusion audience never catches
 * everyone, a qualified-only conversion event spends a fortnight learning, and
 * some of that budget was always going to be wasted. Claiming all of it would
 * make the number bigger and the page worthless in front of somebody who runs
 * ad accounts for a living.
 *
 * Named, exported, and printed in the footnote under the result, so a reader
 * can disagree with it explicitly rather than suspect it quietly.
 */
export const RECLAIM_SHARE = 0.4;

/**
 * The leak calculator: before the gate, and after it.
 *
 * It measures MONEY, not minutes. An earlier version costed the staff hours
 * spent disqualifying, which is true, small, and recognised by nobody: an owner
 * reads "39 hours a month" and feels nothing, because those people are salaried
 * and were going to be at work anyway. What hurts is the ad spend that bought
 * people who could never buy, and the enrolments that budget could have bought
 * instead. So the two sides are today's leak and what the same budget does once
 * the wrong-fit traffic stops being bought.
 *
 * Defaults are a plausible mid-size business in that industry, not a flattering
 * one. Every figure on screen is derived from what the visitor typed, with the
 * arithmetic printed underneath.
 */
export type IndustryLeakSpec = {
  heading: string;
  lead: string;
  enquiriesLabel: string;
  enquiriesDefault: number;
  /** Their real monthly outcome count, so the close rate is theirs, not ours. */
  outcomesLabel: string;
  outcomesDefault: number;
  valueLabel: string;
  valueHint: string;
  valueDefault: number;
  spendLabel: string;
  spendHint: string;
  spendDefault: number;
  wrongFitLegend: string;
  wrongFitLabel: string;
  wrongFitHint: string;
  wrongFitDefaultBand: WrongFitBandId;
  /** The noun for one enquiry, singular, used inside the working. */
  unit: string;
  /** The noun for one sale, singular and plural, used inside the working. */
  outcomeUnit: string;
  outcomeUnitPlural: string;
  beforeHeading: string;
  afterHeading: string;
  /** Every assumption the model makes, printed under the result. */
  assumptions: string;
  caughtHeading: string;
  caught: ReadonlyArray<{ title: string; body: string }>;
};

export type IndustrySpec = {
  key: "study-abroad" | "clinics";
  path: string;
  /** The label in the footer's By industry list. */
  shortName: string;
  /** One short line, for the featured cards in "Who it is for". */
  cardLine: string;
  meta: { title: string; description: string };
  hero: { headline: string; sub: string };
  inbox: { heading: string; body: string; cold: string };
  leak: IndustryLeakSpec;
  research: { heading: string; claim: string; method: string; soWhat: string };
  mechanism: {
    heading: string;
    lead: string;
    gate: string;
    score: string;
    signal: string;
    signalPoints: ReadonlyArray<string>;
  };
  after: {
    heading: string;
    lead: string;
    steps: ReadonlyArray<{ n: string; title: string; body: string }>;
    note: string;
  };
  fit: {
    heading: string;
    lead: string;
    forList: ReadonlyArray<string>;
    notList: ReadonlyArray<string>;
    close: string;
  };
  objections: ReadonlyArray<{ q: string; a: string }>;
  /** RevenueOS CRM. One sentence, no link, no second call to action. */
  crmLine: string;
  finalCta: { heading: string; sub: string };
};

// ---------------------------------------------------------------------------
//  Shared copy
// ---------------------------------------------------------------------------

/**
 * The category finding, written once.
 *
 * It is stated as an OBSERVATION from reading live ads, with the method named and
 * the check handed to the reader, because that is what it is. A round number
 * dressed up as research is the fastest way to lose a sceptical operator, and
 * this one happens to be checkable in the Meta Ad Library in an afternoon.
 */
const RESEARCH_METHOD =
  "That is an observation from reading live Meta ads in this category, not a statistic we commissioned. Open the Meta Ad Library, search your own competitors, and click through to what the ad actually delivers. An afternoon is enough to confirm or break it.";

/** RevenueOS gets one sentence on these pages. Not a section, not a link. */
const CRM_LINE =
  "Qualified leads can flow into RevenueOS CRM later if you want them there, and nothing on this page needs it.";

/** The step that closes every page's "what happens" list, in both industries. */
const AFTER_NOTE = `The build is free for the first ${OFFER_SLOTS}, and the 30-minute call is how it goes live. You keep the account, the scorecard and the ad audiences afterwards.`;

// ---------------------------------------------------------------------------
//  Study abroad
// ---------------------------------------------------------------------------

const STUDY_ABROAD: IndustrySpec = {
  key: "study-abroad",
  path: "/industries/study-abroad",
  shortName: "Study abroad consultancies",
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
  inbox: {
    heading: "If the audit landed in your inbox",
    body: "The one-page audit of your enquiry flow came from us. This page is the rest of it: what the gap between the enquiry and the application costs you, the three steps that close it, and what happens on the call.",
    cold: "Never got one, and arrived here cold? Nothing below depends on it. The arithmetic runs on numbers you type in yourself.",
  },
  leak: {
    heading: "The gap between the enquiry and the application",
    lead: "You are not short of enquiries in an intake season. You are paying for students who were never going to apply, in ad spend first and counsellor hours second. Here is that budget, and here is what it buys once it stops.",
    enquiriesLabel: "Student enquiries a month",
    enquiriesDefault: 180,
    outcomesLabel: "Enrolments a month today",
    outcomesDefault: 10,
    valueLabel: "What one enrolment is worth to you, in rupees",
    valueHint: "Commission plus your own service fee, for one student who actually goes.",
    valueDefault: 120000,
    spendLabel: "What you spend on ads a month, in rupees",
    spendHint: "Meta and Google together, the figure your card is charged.",
    spendDefault: 150000,
    wrongFitLegend: "Of those enquiries, how many can never enrol?",
    wrongFitLabel: "Of every 100 enquiries, how many can never enrol?",
    wrongFitHint:
      "No proof of funds, wrong intake, wrong country, scores nowhere near the bar, or a student whose parent has not agreed to any of it. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "two-thirds",
    unit: "enquiry",
    outcomeUnit: "enrolment",
    outcomeUnitPlural: "enrolments",
    beforeHeading: "Today, with no gate",
    afterHeading: "After the gate and the signal",
    assumptions:
      "Two assumptions, both stated so you can argue with them. Your close rate on a qualified student is taken from your own two numbers, enrolments divided by qualified enquiries, not from an industry figure. And the model reclaims 40 percent of the wasted spend, not all of it: an exclusion audience never catches everyone and a qualified-only conversion event spends a fortnight learning. Extra students are bought at what a qualified enquiry costs you today, which is your whole ad spend divided by the qualified enquiries it produced, not at the cheaper blended rate.",
    caughtHeading: "What a gate would have caught",
    caught: [
      {
        title: "The enquiry never becomes a lead.",
        body: "Funds, scores, intake and the decision-maker are asked before the opt-in. A student who cannot answer them is routed to an exit page, so no record is created, no counsellor opens a file, and there is nothing to clean out of the CRM once the intake closes.",
      },
      {
        title: "Your ads stop buying more of them.",
        body: "Every disqualified visitor fires an exclusion event, so Meta builds a never-show-again audience. Every qualified completion reports as its own conversion, so the campaign optimises toward students with funds and an intake.",
      },
      {
        title: "The students you do counsel arrive scored.",
        body: "You open the conversation already knowing the funds, the scores, the intake and whether the person who actually decides is in the room.",
      },
    ],
  },
  research: {
    heading: "What we found across the category",
    claim:
      "Of the advertisers in this category whose ad copy promises an assessment, an eligibility check, a profile evaluation, a grade or an analysis, roughly nine in ten deliver a plain contact form, a Meta instant form, a Google Form or a WhatsApp link instead. Nothing is scored. Nobody is turned away.",
    method: RESEARCH_METHOD,
    soWhat:
      "So the promise is already being made in your market, by your competitors, in their own ads. It is the delivery that is missing, and the delivery is the part that qualifies.",
  },
  mechanism: {
    heading: "Gate, then Score, then Signal",
    lead: "Three steps, in that order. The third is the one no other assessment tool has.",
    gate: "The screen runs before the opt-in, not after it. Proof of funds, academic scores, intake and target country are asked while the visitor is still anonymous, and a student who cannot answer them never reaches the form. No lead record, no stored result, nothing for a counsellor to call.",
    score: "Everyone who passes is scored on the variables that actually decide an application: funds, scores, intake timing, target country and whether the person who signs the cheque is involved. They get a result that names where they stand and what to fix, which is why they finish it rather than abandoning it.",
    signal:
      "Qualification saves your counsellors' week. This saves your ad budget, and nothing else in the category does it. Meta optimises toward whatever you report as a conversion, and today you are reporting form-fills, which is exactly what it keeps finding you.",
    signalPoints: [
      "Every disqualified enquiry fires an exclusion event, so one Meta audience holds the students who will never qualify and your ad never reaches them again.",
      "Every qualified completion reports as its own conversion event, so the algorithm learns the shape of a student with funds and an intake instead of the shape of somebody who fills in forms.",
      "Cost per enquiry will go up. Cost per application is the number that falls, and that is the trade you are making on purpose.",
    ],
  },
  after: {
    heading: "What happens after you ask",
    lead: "Four steps, and you are in the room for the one that matters.",
    steps: [
      {
        n: "01",
        title: "You send a short brief",
        body: "Which countries and intakes you work, what a good student looks like, and which enquiries waste your counsellors' week.",
      },
      {
        n: "02",
        title: "We write the scorecard",
        body: "The gate questions, the weights, the result bands and the wording, drafted for study abroad rather than adapted from a generic template.",
      },
      {
        n: "03",
        title: "One 30-minute call",
        body: "We set your workspace up, lay the scorecard in, tweak the gate with you, connect your Meta pixel and the Conversions API, and build the exclusion and retargeting audiences in your ad account.",
      },
      {
        n: "04",
        title: "It goes live before you hang up",
        body: "You operate it from then on. We do not run your ads, we do not counsel your students, and nothing in your funnel depends on us being available.",
      },
    ],
    note: AFTER_NOTE,
  },
  fit: {
    heading: "Who this is for, and who it is not",
    lead: "This turns enquiry volume down on purpose. For some consultancies that is the wrong trade, and it is cheaper for both of us to say so here.",
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
    close:
      "If that is you today, close the tab with the arithmetic above. It stays true whether or not you ever buy anything.",
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
  crmLine: CRM_LINE,
  finalCta: {
    heading: "Fewer enquiries. More applications out the door.",
    sub: "We write the gate for your intakes, your countries and your bar, and take it live with you on one call.",
  },
};

// ---------------------------------------------------------------------------
//  Clinics
// ---------------------------------------------------------------------------

const CLINICS: IndustrySpec = {
  key: "clinics",
  path: "/industries/clinics",
  shortName: "Aesthetic and elective clinics",
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
  inbox: {
    heading: "If the audit landed in your inbox",
    body: "The one-page audit of your enquiry flow came from us. This page is the rest of it: what the gap between the enquiry and the chair costs you, the three steps that close it, and what happens on the call.",
    cold: "Never got one, and arrived here cold? Nothing below depends on it. The arithmetic runs on numbers you type in yourself.",
  },
  leak: {
    heading: "The gap between the enquiry and the chair",
    lead: "A price-shopper and a patient cost the same per click. One of them can never book. Here is what that costs you in ad spend every month, and what the same budget buys once it stops being spent on them.",
    enquiriesLabel: "Patient enquiries a month",
    enquiriesDefault: 150,
    outcomesLabel: "Completed treatments a month today",
    outcomesDefault: 12,
    valueLabel: "What one completed treatment is worth to you, in rupees",
    valueHint: "The average, across whatever mix of treatments you actually do.",
    valueDefault: 60000,
    spendLabel: "What you spend on ads a month, in rupees",
    spendHint: "Meta and Google together, the figure your card is charged.",
    spendDefault: 125000,
    wrongFitLegend: "Of those enquiries, how many can never book?",
    wrongFitLabel: "Of every 100 enquiries, how many can never book?",
    wrongFitHint:
      "Only asking the price, nowhere near the budget, wrong city, not deciding this year, or a treatment you do not perform. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "two-thirds",
    unit: "enquiry",
    outcomeUnit: "treatment",
    outcomeUnitPlural: "treatments",
    beforeHeading: "Today, with no gate",
    afterHeading: "After the gate and the signal",
    assumptions:
      "Two assumptions, both stated so you can argue with them. Your close rate on a qualified patient is taken from your own two numbers, treatments divided by qualified enquiries, not from an industry figure. And the model reclaims 40 percent of the wasted spend, not all of it: an exclusion audience never catches everyone and a qualified-only conversion event spends a fortnight learning. Extra patients are bought at what a qualified enquiry costs you today, which is your whole ad spend divided by the qualified enquiries it produced, not at the cheaper blended rate.",
    caughtHeading: "What a gate would have caught",
    caught: [
      {
        title: "The enquiry never becomes a lead.",
        body: "Budget band, treatment intent, timeline and location are asked before the opt-in. A visitor who cannot answer them is routed to an exit page, so no record is created, no consultation is offered, and your coordinator's morning stays her own.",
      },
      {
        title: "Your ads stop buying more of them.",
        body: "Every disqualified visitor fires an exclusion event, so Meta builds a never-show-again audience. Every qualified completion reports as its own conversion, so the campaign optimises toward patients who can pay and intend to book.",
      },
      {
        title: "The patients you do see arrive scored.",
        body: "You open the consultation already knowing the budget band, the treatment they want and when they intend to have it, so the conversation starts at clinical rather than at commercial.",
      },
    ],
  },
  research: {
    heading: "What we found across the category",
    claim:
      "Of the advertisers in this category whose ad copy promises an assessment, a suitability check, a candidacy evaluation, a grade or an analysis, roughly nine in ten deliver a plain contact form, a Meta instant form, a Google Form or a WhatsApp link instead. Nothing is scored. Nobody is turned away.",
    method: RESEARCH_METHOD,
    soWhat:
      "So the promise is already being made in your market, by clinics down the road, in their own ads. It is the delivery that is missing, and the delivery is the part that qualifies.",
  },
  mechanism: {
    heading: "Gate, then Score, then Signal",
    lead: "Three steps, in that order. The third is the one no other assessment tool has.",
    gate: "The screen runs before the opt-in, not after it. Budget band, treatment intent, timeline and location are asked while the visitor is still anonymous, and anyone who fails never reaches the form. No lead record, no stored result, no consultation to reschedule.",
    score: "Everyone who passes is scored on the four variables that decide whether a treatment happens: budget, intent, timeline and location. They get a result that names where they stand and what the honest next step is, which is why they finish it instead of abandoning it halfway.",
    signal:
      "A gate saves your coordinator's morning. This saves your ad budget, and nothing else in the category does it. Meta optimises toward whatever you report as a conversion, and today you are reporting form-fills, which is exactly what it keeps finding you.",
    signalPoints: [
      "Every disqualified visitor fires an exclusion event, so one Meta audience holds the people who will never book and your ad never reaches them again.",
      "Every qualified completion reports as its own conversion event, so the algorithm learns the shape of a patient who can pay rather than the shape of somebody who asks the price.",
      "Cost per lead will go up. Cost per completed treatment is the number that falls, and that is the trade you are making on purpose.",
    ],
  },
  after: {
    heading: "What happens after you ask",
    lead: "Four steps, and you are in the room for the one that matters.",
    steps: [
      {
        n: "01",
        title: "You send a short brief",
        body: "Which treatments you want more of, the budget below which you would rather not take the call, and what wastes your coordinator's morning.",
      },
      {
        n: "02",
        title: "We write the scorecard",
        body: "The gate questions, the weights, the result bands and the wording, drafted for an elective-treatment enquiry rather than adapted from a generic template.",
      },
      {
        n: "03",
        title: "One 30-minute call",
        body: "We set your workspace up, lay the scorecard in, tweak the gate with you, connect your Meta pixel and the Conversions API, and build the exclusion and retargeting audiences in your ad account.",
      },
      {
        n: "04",
        title: "It goes live before you hang up",
        body: "You operate it from then on. We do not run your ads and we do not touch anything clinical. Nothing in your funnel depends on us being available.",
      },
    ],
    note: AFTER_NOTE,
  },
  fit: {
    heading: "Who this is for, and who it is not",
    lead: "This turns enquiry volume down on purpose. For some clinics that is the wrong trade, and it is cheaper for both of us to say so here.",
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
    close:
      "If that is you today, close the tab with the arithmetic above. It stays true whether or not you ever buy anything.",
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
  crmLine: CRM_LINE,
  finalCta: {
    heading: "Fewer enquiries. More chairs filled.",
    sub: "We write the gate for your treatments, your budget bar and your city, and take it live with you on one call.",
  },
};

// ---------------------------------------------------------------------------
//  The registry, and the footer's ordering
// ---------------------------------------------------------------------------

export const INDUSTRY_PAGES: ReadonlyArray<IndustrySpec> = [STUDY_ABROAD, CLINICS];

export function getIndustry(key: IndustrySpec["key"]): IndustrySpec {
  const spec = INDUSTRY_PAGES.find((p) => p.key === key);
  // Unreachable with the literal union above; a throw beats a non-null assertion,
  // because if the union and the array ever disagree this says which key was asked for.
  if (!spec) throw new Error(`Unknown industry page: ${key}`);
  return spec;
}

/**
 * The By industry list in the footer, in the order it renders.
 *
 * The two pages above come first and render emphasised, because they are the two
 * audiences the business is actively pointing ads and email at. After them come
 * the keyword pages in a chosen order rather than registry order, since the
 * registry is sorted by when each page was written and the footer should lead
 * with the industries that matter commercially.
 *
 * Slugs NOT listed here still render, in registry order, after the ones that are:
 * the failure mode of a hand-kept list is an industry page that silently leaves
 * the site's only navigation, and nothing errors when it does.
 */
export const BY_INDUSTRY_LEAD_SLUGS: ReadonlyArray<string> = [
  "lead-qualification-for-saas",
  "lead-qualification-for-agencies",
  "lead-qualification-for-coaches",
];
