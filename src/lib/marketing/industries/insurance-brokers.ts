import { defineIndustry } from "./define";

/**
 * Insurance brokers.
 *
 * 🔴 The gate asks for DECLARED basics only: cover type, age band, existing
 * cover, timeline. It does not underwrite and it must never look as though it
 * does, because acceptance is the insurer's decision and a page implying
 * otherwise would be quoting cover nobody has agreed to provide. Said out loud
 * in the gate paragraph and in an objection.
 */
export const INSURANCE_BROKERS = defineIndustry({
  key: "insurance-brokers",
  shortName: "Insurance brokers",
  category: "Insurance brokers",
  keywordSlug: "lead-qualification-for-insurance-brokers",
  cardLine: "Cover type, timeline and intent, settled before an adviser quotes.",
  meta: {
    title: "Lead qualification for insurance brokers",
    description:
      "Quoting people who are comparing premiums for sport is the cheapest traffic and the most expensive hour. Assess360 settles cover type, timeline and intent before the opt-in, scores everyone who passes, and reports only qualified enquiries back to Meta.",
  },
  hero: {
    headline:
      "The premium-shoppers never reach an adviser. And your ads learn to stop finding them.",
    sub: "The cover they actually want, what they already hold, when they intend to buy and who is covered are settled before the opt-in, so your advisers stop quoting people who were never going to proceed. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the enquiry and the issued policy",
  businesses: "brokerages",
  rivals: "the brokers advertising beside you",
  promiseWords:
    "an assessment, a cover check, a protection gap score, a needs analysis, a grade or an analysis",
  gainNoun: "policyholders",
  neverVerb: "can never be issued a policy",
  leak: {
    lead: "Insurance has the cheapest clicks and the most expensive follow-up in this whole list, because a quote is a conversation and most of them were comparisons rather than purchases. Here is what the comparison traffic costs you in ad spend every month, and what the same budget buys once it stops.",
    enquiriesLabel: "Enquiries a month",
    enquiriesDefault: 400,
    outcomesLabel: "Policies issued a month today",
    outcomesDefault: 40,
    valueLabel: "What one issued policy is worth to you",
    valueHint: "Your first-year commission or fee, on the mix you actually place.",
    valueDefault: 25000,
    spendDefault: 100000,
    wrongFitHint:
      "A product you do not place, cover far below where it is worth your time, not buying for a year, outside where you are licensed, or somebody comparing premiums with no intention of moving. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "most",
    unit: "enquiry",
    outcomeUnit: "policy",
    outcomeUnitPlural: "policies",
    caught: [
      {
        title: "The quote never gets prepared.",
        body: "Cover type, existing cover, timeline and who is to be covered are asked before the opt-in. An enquiry that cannot answer them is routed to an exit page with something useful on it, so no adviser prepares a comparison and nobody joins a follow-up sequence they will never answer.",
      },
      {
        title: "The enquiries you do quote intend to buy.",
        body: "You know the cover they want, what they hold today and when they mean to act, so the call is about placing cover rather than about explaining the difference between two products to somebody browsing.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. Cover type, existing cover, timeline and who is to be covered are asked while the visitor is still anonymous, and an enquiry that fails never reaches the form. 🔴 It collects declared answers and nothing more: it does not underwrite, it never says anybody is or is not insurable, and acceptance stays entirely the insurer's decision.",
    score: "Everyone who passes is scored on what decides whether cover gets placed: how large the gap between what they hold and what they need is, how soon they intend to act, the cover band and whether the person asking is the one who will sign. They get a read on their own protection gap, which is genuinely useful and the reason they finish it.",
    signalOpener: "A gate keeps your advisers off quotes that were never going to be bought.",
    neverNoun: "the people who compare premiums and never move",
    goodShape: "somebody with a real gap in cover who intends to close it",
    badShape: "somebody comparing premiums for sport",
    optimisesToward: "people with a real protection gap who intend to buy",
  },
  costPer: { before: "Cost per enquiry", after: "Cost per issued policy" },
  after: {
    brief:
      "The products you place, the cover bands worth your time, where you are licensed, and the enquiry your advisers are tired of quoting.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted as a protection-gap read and written so nothing in it looks like underwriting.",
    notOurJob:
      "We do not run your ads, we underwrite nothing, and the scorecard never tells anybody whether they are insurable.",
  },
  fit: {
    forList: [
      "Adviser time on the phone is your real cost",
      "You run ads to a quote form or a callback request",
      "You can name the products you place and the ones you do not",
      "You can name the cover band below which a case is not worth working",
      "You would rather quote forty intending buyers than four hundred comparers",
    ],
    notList: [
      "Your model is volume comparison and the quote itself is the product",
      "You are paid per lead passed on rather than per policy placed",
      "You want the tool to decide who is insurable. It does not and must not",
      "Your business is all renewals and you buy no new traffic",
      "You want somebody to run the ads for you. This is software you operate",
    ],
  },
  objections: [
    {
      q: "Does this decide who we can insure?",
      a: "No, and nothing in it may be read that way. It collects what the visitor declares about the cover they want and when they want it, and scores whether the ENQUIRY is worth an adviser's time. Underwriting and acceptance are the insurer's, every time, and the result wording is drafted so it never implies otherwise.",
    },
    {
      q: "Our traffic is cheap. Wasting some of it hardly matters.",
      a: "The clicks are cheap and the follow-up is not. Four hundred enquiries a month at a few minutes each is an adviser you are paying to talk to people who will not buy, and the arithmetic above only counts the ad spend, which means it understates your case rather than overstating it.",
    },
    {
      q: "People shop insurance on price. Filtering just sends them to a rival.",
      a: "Some of them, yes, and those were going to the cheapest quote regardless. The gate is not trying to win a price comparison, it is trying to stop you paying to enter one. What it keeps is the enquiry with a real gap in cover, where advice is worth something and price is not the only question.",
    },
    {
      q: "We buy leads from comparison sites.",
      a: "Then this governs only the share that comes through your own ads and website, and the bought leads are unaffected. Put just that share into the arithmetic above. If it is small, say no.",
    },
    {
      q: "Will cost per lead go up?",
      a: "Yes, because you have stopped buying the cheap ones. Cost per issued policy is the number that falls, and reporting only qualified completions to Meta is what makes the ad account chase policies instead of form-fills.",
    },
  ],
  finalCta: {
    heading: "Fewer quotes. More policies issued.",
    sub: "We write the gate for the products you place, your cover bands and your licensing, and take it live with you on one call.",
  },
});
